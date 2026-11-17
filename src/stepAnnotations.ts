import * as vscode from 'vscode';
import { PathfinderDataProvider } from './pathfinderDataProvider';
import { CodePath, PathStep } from './models/CodePath';
import { STEP_KIND_STYLES } from './pathFile';

const MAX_ANNOTATION_LENGTH = 90;

const HOVER_COMMANDS = [
    'pathfinder.goToStep',
    'pathfinder.toggleStepReviewed',
    'pathfinder.openStepChanges',
    'pathfinder.showPathMap'
];

export class StepAnnotations implements vscode.Disposable {
    private readonly normalType = vscode.window.createTextEditorDecorationType({
        after: {
            color: new vscode.ThemeColor('editorCodeLens.foreground'),
            fontStyle: 'italic',
            margin: '0 0 0 3em'
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    private readonly currentType = vscode.window.createTextEditorDecorationType({
        after: {
            color: new vscode.ThemeColor('textLink.foreground'),
            fontStyle: 'italic',
            fontWeight: 'bold',
            margin: '0 0 0 3em'
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly provider: PathfinderDataProvider) {
        this.disposables.push(
            this.normalType,
            this.currentType,
            provider.onDidChangeTreeData(() => this.update()),
            vscode.window.onDidChangeVisibleTextEditors(() => this.update()),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('pathfinder.showInlineNotes')) {
                    this.update();
                }
            })
        );
        this.update();
    }

    update() {
        const enabled = vscode.workspace.getConfiguration('pathfinder').get<boolean>('showInlineNotes', true);
        const current = this.provider.getCurrentStep();

        for (const editor of vscode.window.visibleTextEditors) {
            const normal: vscode.DecorationOptions[] = [];
            const currentLine: vscode.DecorationOptions[] = [];

            if (enabled) {
                const byLine = new Map<number, { path: CodePath; step: PathStep }[]>();
                const fsPath = editor.document.uri.fsPath;
                for (const path of this.provider.getCodePaths()) {
                    for (const step of path.steps) {
                        if (step.resourceUri?.fsPath === fsPath && step.lineNumber !== undefined
                            && step.lineNumber <= editor.document.lineCount) {
                            const list = byLine.get(step.lineNumber) ?? [];
                            list.push({ path, step });
                            byLine.set(step.lineNumber, list);
                        }
                    }
                }

                for (const [lineNumber, entries] of byLine) {
                    const line = editor.document.lineAt(lineNumber - 1);
                    const text = entries.map(({ path, step }) =>
                        [`${step.stepNumber}/${path.steps.length}`, step.kind && step.kind !== 'context' ? step.kind : undefined, step.customLabel ?? path.label]
                            .filter(Boolean).join(' · ')
                    ).join('  ·  ');
                    const options: vscode.DecorationOptions = {
                        range: line.range,
                        hoverMessage: entries.map(({ path, step }) => buildHover(path, step)),
                        renderOptions: { after: { contentText: `◆ ${truncate(text)}` } }
                    };
                    (entries.some(e => e.step === current) ? currentLine : normal).push(options);
                }
            }

            editor.setDecorations(this.normalType, normal);
            editor.setDecorations(this.currentType, currentLine);
        }
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}

function truncate(text: string): string {
    return text.length > MAX_ANNOTATION_LENGTH ? `${text.slice(0, MAX_ANNOTATION_LENGTH - 1)}…` : text;
}

function commandLink(label: string, command: string, args: unknown[]): string {
    return `[${label}](command:${command}?${encodeURIComponent(JSON.stringify(args))})`;
}

function buildHover(path: CodePath, step: PathStep): vscode.MarkdownString {
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: HOVER_COMMANDS };
    md.appendMarkdown(`**${escape(path.label as string)}** · step ${step.stepNumber} of ${path.steps.length}`
        + (step.kind ? ` · ${STEP_KIND_STYLES[step.kind].label}` : '')
        + (step.reviewed ? ' $(pass-filled)' : ''));
    if (step.customLabel) {
        md.appendMarkdown(`\n\n**${escape(step.customLabel)}**`);
    }
    if (step.detail) {
        md.appendMarkdown(`\n\n${step.detail}`);
    }
    if (step.stepNumber === 1 && path.summary) {
        md.appendMarkdown(`\n\n---\n\n${path.summary}`);
    }

    const links: string[] = [];
    if (step.stepNumber! > 1) {
        links.push(commandLink('$(arrow-up) Previous', 'pathfinder.goToStep', [path.id, step.stepNumber! - 1]));
    }
    if (step.stepNumber! < path.steps.length) {
        links.push(commandLink('$(arrow-down) Next', 'pathfinder.goToStep', [path.id, step.stepNumber! + 1]));
    }
    links.push(commandLink(step.reviewed ? '$(circle-large-outline) Unmark reviewed' : '$(check) Mark reviewed',
        'pathfinder.toggleStepReviewed', [path.id, step.stepNumber]));
    links.push(commandLink('$(git-compare) Changes', 'pathfinder.openStepChanges', [path.id, step.stepNumber]));
    links.push(commandLink('$(type-hierarchy) Path map', 'pathfinder.showPathMap', [path.id]));
    md.appendMarkdown(`\n\n---\n\n${links.join(' &nbsp; ')}`);
    return md;
}

function escape(text: string): string {
    return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}
