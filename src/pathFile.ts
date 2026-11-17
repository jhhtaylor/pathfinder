import * as path from 'path';

export const STEP_KINDS = ['new', 'changed', 'context', 'test'] as const;
export type StepKind = typeof STEP_KINDS[number];

export const STEP_KIND_STYLES: Record<StepKind, { label: string; description: string; icon: string; color?: string }> = {
    new: { label: 'New', description: 'Code added for this change', icon: 'diff-added', color: 'gitDecoration.addedResourceForeground' },
    changed: { label: 'Changed', description: 'Existing code modified for this change', icon: 'diff-modified', color: 'gitDecoration.modifiedResourceForeground' },
    context: { label: 'Context', description: 'Unchanged code included to explain the flow', icon: 'circle-outline' },
    test: { label: 'Test', description: 'A test covering this change', icon: 'beaker', color: 'charts.purple' },
};

export function parseStepKind(value: unknown): StepKind | undefined {
    return STEP_KINDS.find(k => k === value);
}

export interface StepData {
    filePath: string;
    repo?: string;
    kind?: StepKind;
    lineNumber: number;
    columnNumber?: number;
    codeSnippet?: string;
    customLabel?: string;
    detail?: string;
    reviewed?: boolean;
}

export interface PathData {
    label: string;
    id?: string;
    creationTime?: string;
    colorName?: string;
    summary?: string;
    steps: StepData[];
}

const optionalString = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : undefined);

// Accepts an array of paths, { paths: [...] }, or a single path object, so files
// hand-written by an AI only need label + steps[].filePath/lineNumber.
export function parsePathFile(content: string): PathData[] {
    const json = JSON.parse(content);
    const raw: unknown[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.paths)
            ? json.paths
            : json && Array.isArray(json.steps)
                ? [json]
                : [];

    if (raw.length === 0) {
        throw new Error('No code paths found. Expected an array of paths, { "paths": [...] }, or a single path with "steps".');
    }

    return raw.map((p: any, i) => {
        if (!p || !Array.isArray(p.steps)) {
            throw new Error(`Path ${i + 1} has no "steps" array.`);
        }
        const steps: StepData[] = p.steps.map((s: any, j: number) => {
            if (!s || typeof s.filePath !== 'string' || typeof s.lineNumber !== 'number' || s.lineNumber < 1) {
                throw new Error(`Path ${i + 1}, step ${j + 1} needs a "filePath" string and a 1-based "lineNumber".`);
            }
            return {
                filePath: s.filePath,
                repo: optionalString(s.repo),
                kind: parseStepKind(s.kind),
                lineNumber: Math.floor(s.lineNumber),
                columnNumber: typeof s.columnNumber === 'number' ? s.columnNumber : 0,
                codeSnippet: optionalString(s.codeSnippet),
                customLabel: optionalString(s.customLabel),
                detail: optionalString(s.detail),
            };
        });
        return {
            label: optionalString(p.label) ?? `Imported Path ${i + 1}`,
            id: optionalString(p.id),
            creationTime: optionalString(p.creationTime),
            colorName: optionalString(p.colorName),
            summary: optionalString(p.summary),
            steps,
        };
    });
}

const isForeignAbsolute = (p: string) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\');

// Shared files may hold paths from another machine. Try them as-is, then relative to
// each root, then progressively shorter suffixes of a foreign absolute path.
export function resolveStepFile(filePath: string, roots: string[], exists: (p: string) => boolean): string {
    if (path.isAbsolute(filePath) && exists(filePath)) {
        return filePath;
    }

    const segments = filePath.split(/[\\/]+/).filter(Boolean);
    if (!isForeignAbsolute(filePath)) {
        for (const root of roots) {
            const candidate = path.join(root, ...segments);
            if (exists(candidate)) {
                return candidate;
            }
        }
        return roots.length > 0 ? path.join(roots[0], ...segments) : filePath;
    }

    for (let i = 1; i < segments.length; i++) {
        for (const root of roots) {
            const candidate = path.join(root, ...segments.slice(i));
            if (exists(candidate)) {
                return candidate;
            }
        }
    }
    return filePath;
}

export function toPortablePath(filePath: string, roots: string[]): string {
    for (const root of roots) {
        const rel = path.relative(root, filePath);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
            return rel.split(path.sep).join('/');
        }
    }
    return filePath;
}

// Returns the 1-based line where the snippet now lives, preferring the stored line,
// then the nearest exact match, then the nearest line containing it.
export function findAnchoredLine(lines: string[], lineNumber: number, snippet?: string): number {
    const target = snippet?.trim();
    if (!target) {
        return lineNumber;
    }
    const idx = lineNumber - 1;
    if (idx >= 0 && idx < lines.length && lines[idx].includes(target)) {
        return lineNumber;
    }
    const nearest = (match: (line: string) => boolean): number | undefined => {
        for (let d = 0; d < lines.length; d++) {
            for (const i of [idx - d, idx + d]) {
                if (i >= 0 && i < lines.length && match(lines[i])) {
                    return i + 1;
                }
            }
        }
        return undefined;
    };
    return nearest(l => l.trim() === target) ?? nearest(l => l.includes(target)) ?? lineNumber;
}
