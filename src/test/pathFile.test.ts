import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { findAnchoredLine, parsePathFile, resolveStepFile, toPortablePath } from '../pathFile';
import { PathfinderDataProvider } from '../pathfinderDataProvider';
import { CodePath } from '../models/CodePath';
import { toMermaid } from '../pathMap';
import { commentFor, extractRepoNameFromUrl, stepIdentifier } from '../copyOperations';

class MemoryMemento implements vscode.Memento {
    private store: Record<string, any> = {};
    keys() { return Object.keys(this.store); }
    get<T>(key: string, defaultValue?: T): T { return (key in this.store ? this.store[key] : defaultValue) as T; }
    update(key: string, value: any) { this.store[key] = value; return Promise.resolve(); }
}

suite('Path file parsing', () => {
    test('accepts a minimal AI-written path with only label and steps', () => {
        const [p] = parsePathFile(JSON.stringify([{ label: 'Login', steps: [{ filePath: 'src/a.ts', lineNumber: 3 }] }]));
        assert.strictEqual(p.label, 'Login');
        assert.strictEqual(p.id, undefined);
        assert.strictEqual(p.steps[0].lineNumber, 3);
    });

    test('accepts { paths: [...] } and a single path object', () => {
        const step = { filePath: 'a.ts', lineNumber: 1 };
        assert.strictEqual(parsePathFile(JSON.stringify({ paths: [{ label: 'A', steps: [step] }] })).length, 1);
        assert.strictEqual(parsePathFile(JSON.stringify({ label: 'B', summary: 'why', steps: [step] }))[0].summary, 'why');
    });

    test('keeps detail and drops empty strings', () => {
        const [p] = parsePathFile(JSON.stringify([{ label: 'A', colorName: '', steps: [{ filePath: 'a.ts', lineNumber: 1, detail: 'long **why**', customLabel: '' }] }]));
        assert.strictEqual(p.colorName, undefined);
        assert.strictEqual(p.steps[0].detail, 'long **why**');
        assert.strictEqual(p.steps[0].customLabel, undefined);
    });

    test('rejects steps without a usable line number', () => {
        assert.throws(() => parsePathFile(JSON.stringify([{ label: 'A', steps: [{ filePath: 'a.ts' }] }])), /lineNumber/);
        assert.throws(() => parsePathFile(JSON.stringify({ nothing: true })), /No code paths/);
    });
});

suite('Step file resolution', () => {
    const root = path.join(path.sep, 'work', 'repo');
    const existing = new Set([path.join(root, 'src', 'auth', 'login.ts')]);
    const exists = (p: string) => existing.has(p);

    test('resolves workspace-relative paths', () => {
        assert.strictEqual(resolveStepFile('src/auth/login.ts', [root], exists), path.join(root, 'src', 'auth', 'login.ts'));
    });

    test('re-roots an absolute path from another machine', () => {
        assert.strictEqual(resolveStepFile('/Users/someone/code/repo/src/auth/login.ts', [root], exists), path.join(root, 'src', 'auth', 'login.ts'));
        assert.strictEqual(resolveStepFile('C:\\dev\\repo\\src\\auth\\login.ts', [root], exists), path.join(root, 'src', 'auth', 'login.ts'));
    });

    test('keeps an absolute path that exists', () => {
        const abs = path.join(root, 'src', 'auth', 'login.ts');
        assert.strictEqual(resolveStepFile(abs, ['/elsewhere'], exists), abs);
    });

    test('toPortablePath makes paths workspace-relative with forward slashes', () => {
        assert.strictEqual(toPortablePath(path.join(root, 'src', 'a.ts'), [root]), 'src/a.ts');
        assert.strictEqual(toPortablePath('/outside/a.ts', [root]), '/outside/a.ts');
    });
});

suite('Line re-anchoring', () => {
    const lines = ['import x;', '', 'function a() {', '  return token.refresh();', '}', '  return token.refresh();'];

    test('keeps the stored line when the snippet still matches', () => {
        assert.strictEqual(findAnchoredLine(lines, 4, 'return token.refresh();'), 4);
    });

    test('moves to the nearest exact match when code shifted', () => {
        assert.strictEqual(findAnchoredLine(lines, 2, 'return token.refresh();'), 4);
        assert.strictEqual(findAnchoredLine(lines, 7, 'return token.refresh();'), 6);
    });

    test('falls back to a line containing the snippet', () => {
        assert.strictEqual(findAnchoredLine(lines, 1, 'a()'), 3);
    });

    test('leaves the line alone without a snippet or a match', () => {
        assert.strictEqual(findAnchoredLine(lines, 2, undefined), 2);
        assert.strictEqual(findAnchoredLine(lines, 2, 'nowhere'), 2);
    });
});

suite('Importing paths', () => {
    test('re-importing replaces a path by id instead of duplicating it', () => {
        const provider = new PathfinderDataProvider(new MemoryMemento());
        const data = parsePathFile(JSON.stringify([{ label: 'A', id: 'p1', steps: [{ filePath: '/x/a.ts', lineNumber: 1 }] }]));
        assert.deepStrictEqual(provider.addImportedPaths(data, []), { added: 1, replaced: 0 });
        assert.deepStrictEqual(provider.addImportedPaths(data, []), { added: 0, replaced: 1 });
        assert.strictEqual(provider.getCodePaths().length, 1);
    });

    test('paths without an id replace by label', () => {
        const provider = new PathfinderDataProvider(new MemoryMemento());
        const data = parsePathFile(JSON.stringify({ label: 'Ticket 42', steps: [{ filePath: '/x/a.ts', lineNumber: 1 }] }));
        provider.addImportedPaths(data, []);
        provider.addImportedPaths(data, []);
        assert.strictEqual(provider.getCodePaths().length, 1);
        assert.strictEqual(provider.getCodePaths()[0].steps[0].pathId, provider.getCodePaths()[0].id);
    });

    test('summary, detail and reviewed survive a reload from workspace state', () => {
        const memento = new MemoryMemento();
        const provider = new PathfinderDataProvider(memento);
        provider.addImportedPaths(parsePathFile(JSON.stringify({ label: 'A', summary: 'why', steps: [{ filePath: '/x/a.ts', lineNumber: 1, detail: 'd' }] })), []);
        provider.setStepReviewed(provider.getCodePaths()[0].steps[0], true);

        const reloaded = new PathfinderDataProvider(memento).getCodePaths()[0];
        assert.strictEqual(reloaded.summary, 'why');
        assert.strictEqual(reloaded.steps[0].detail, 'd');
        assert.strictEqual(reloaded.steps[0].reviewed, true);
        assert.match(String(reloaded.description), /1\/1 reviewed/);
    });
});

suite('Mermaid export', () => {
    test('groups steps by file and styles edges by relationship', () => {
        const p = new CodePath('Flow', 'p1');
        p.addStep('/r/a.ts', 1, 0, undefined, 'entry "point"');
        p.addStep('/r/b.ts', 5);
        p.addStep('/r/a.ts', 9);
        const text = toMermaid(p, [
            { symbol: 'main', edge: 'calls' },
            { symbol: 'helper', edge: 'returns' },
            { symbol: 'main' }
        ], s => path.basename(s.resourceUri!.fsPath));

        assert.match(text, /subgraph f0\["a\.ts"\]\n {8}s1\["1\. main<br\/>entry #quot;point#quot;"\]\n {8}s3/);
        assert.match(text, /s1 -->\|calls\| s2/);
        assert.match(text, /s2 -\.->\|returns to\| s3/);
    });
});

suite('Copy helpers', () => {
    test('extracts repo names from HTTPS and SSH remotes', () => {
        assert.strictEqual(extractRepoNameFromUrl('https://github.com/jhhtaylor/pathfinder.git'), 'pathfinder');
        assert.strictEqual(extractRepoNameFromUrl('git@github.com:jhhtaylor/pathfinder.git'), 'pathfinder');
    });

    test('builds the identifier with the step note when there is one', () => {
        assert.strictEqual(stepIdentifier('pathfinder', 'a.ts', 42), 'pathfinder - a.ts - line 42');
        assert.strictEqual(stepIdentifier('pathfinder', 'a.ts', 42, 'Catch the 401'), 'pathfinder - a.ts - line 42 - Catch the 401');
    });

    test('wraps the identifier in the language comment syntax', () => {
        assert.strictEqual(commentFor('typescript', 'x'), '// x');
        assert.strictEqual(commentFor('python', 'x'), '# x');
        assert.strictEqual(commentFor('html', 'x'), '<!-- x -->');
        assert.strictEqual(commentFor('unknown-lang', 'x'), '// x');
    });
});

suite('Repos and kinds', () => {
    test('parses known kinds and drops unknown ones', () => {
        const [p] = parsePathFile(JSON.stringify({ label: 'A', steps: [
            { filePath: 'a.ts', lineNumber: 1, kind: 'new', repo: 'api' },
            { filePath: 'b.ts', lineNumber: 1, kind: 'refactor' }
        ] }));
        assert.strictEqual(p.steps[0].kind, 'new');
        assert.strictEqual(p.steps[0].repo, 'api');
        assert.strictEqual(p.steps[1].kind, undefined);
    });

    test('a step with a repo resolves inside that repo even when another root has the same file', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pathfinder-repos-'));
        for (const repo of ['web', 'api']) {
            fs.mkdirSync(path.join(dir, repo, 'src'), { recursive: true });
            fs.writeFileSync(path.join(dir, repo, 'src', 'index.ts'), `// ${repo}\n`);
        }
        try {
            const provider = new PathfinderDataProvider(new MemoryMemento());
            const data = parsePathFile(JSON.stringify({ label: 'Cross repo', steps: [
                { filePath: 'src/index.ts', lineNumber: 1, repo: 'api', kind: 'changed' },
                { filePath: 'src/index.ts', lineNumber: 1, repo: 'web' }
            ] }));
            const repoRoots = new Map([['web', path.join(dir, 'web')], ['api', path.join(dir, 'api')]]);
            provider.addImportedPaths(data, [path.join(dir, 'web'), path.join(dir, 'api')], repoRoots);

            const steps = provider.getCodePaths()[0].steps;
            assert.strictEqual(steps[0].resourceUri!.fsPath, path.join(dir, 'api', 'src', 'index.ts'));
            assert.strictEqual(steps[1].resourceUri!.fsPath, path.join(dir, 'web', 'src', 'index.ts'));
            assert.strictEqual(steps[0].kind, 'changed');
            assert.strictEqual(steps[0].codeSnippet, '// api', 'missing snippets are filled from the file');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('Mermaid tags kinds in labels and styles them', () => {
        const p = new CodePath('Flow', 'p1');
        p.addStep('/r/a.ts', 1)!.kind = 'new';
        p.addStep('/r/a.ts', 2)!.kind = 'context';
        const text = toMermaid(p, [{ symbol: 'a' }, { symbol: 'b' }], () => 'a.ts');
        assert.match(text, /s1\["1\. a \(new\)"\]/);
        assert.match(text, /s2\["2\. b"\]/);
        assert.match(text, /classDef new stroke:#2da44e/);
        assert.doesNotMatch(text, /classDef context/);
    });
});
