import * as vscode from 'vscode';
import * as path from 'path';
import { CodePath, PathStep } from './models/CodePath';
import { PathfinderDataProvider } from './pathfinderDataProvider';

// How step N leads to step N+1, worked out from the code rather than the step order.
export type EdgeKind = 'calls' | 'returns' | 'same' | 'next';

export interface StepInfo {
    symbol?: string;
    edge?: EdgeKind;
}

interface EnclosingSymbol {
    name: string;
    uri: vscode.Uri;
    range: vscode.Range;
    selectionRange: vscode.Range;
}

const CALLABLE_KINDS = new Set([
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Method,
    vscode.SymbolKind.Constructor
]);

const analysisCache = new Map<string, { signature: string; infos: StepInfo[] }>();
const inFlight = new Map<string, Promise<StepInfo[]>>();

function signatureOf(codePath: CodePath): string {
    return codePath.steps.map(s => `${s.resourceUri?.fsPath}:${s.lineNumber}`).join('|');
}

export function getCachedAnalysis(codePath: CodePath): StepInfo[] | undefined {
    const cached = analysisCache.get(codePath.id);
    return cached && cached.signature === signatureOf(codePath) ? cached.infos : undefined;
}

export async function analyzePath(codePath: CodePath): Promise<StepInfo[]> {
    const cached = getCachedAnalysis(codePath);
    if (cached) {
        return cached;
    }
    const key = `${codePath.id}|${signatureOf(codePath)}`;
    if (!inFlight.has(key)) {
        inFlight.set(key, runAnalysis(codePath).finally(() => inFlight.delete(key)));
    }
    return inFlight.get(key)!;
}

async function runAnalysis(codePath: CodePath): Promise<StepInfo[]> {
    const symbolCache = new Map<string, vscode.DocumentSymbol[]>();
    const symbols = await Promise.all(codePath.steps.map(s => enclosingSymbol(s, symbolCache)));

    const infos: StepInfo[] = [];
    for (let i = 0; i < symbols.length; i++) {
        const info: StepInfo = { symbol: symbols[i]?.name };
        if (i < symbols.length - 1) {
            info.edge = await edgeBetween(symbols[i], symbols[i + 1]);
        }
        infos.push(info);
    }

    analysisCache.set(codePath.id, { signature: signatureOf(codePath), infos });
    return infos;
}

async function enclosingSymbol(step: PathStep, cache: Map<string, vscode.DocumentSymbol[]>): Promise<EnclosingSymbol | undefined> {
    const uri = step.resourceUri;
    if (!uri || step.lineNumber === undefined) {
        return undefined;
    }
    const key = uri.toString();
    if (!cache.has(key)) {
        try {
            const result = await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
                'vscode.executeDocumentSymbolProvider', uri
            );
            cache.set(key, (result ?? []).filter((s): s is vscode.DocumentSymbol => 'children' in s));
        } catch {
            cache.set(key, []);
        }
    }

    const position = new vscode.Position(step.lineNumber - 1, 0);
    let bestCallable: vscode.DocumentSymbol | undefined;
    let bestAny: vscode.DocumentSymbol | undefined;
    const walk = (list: vscode.DocumentSymbol[]) => {
        for (const s of list) {
            if (s.range.start.line <= position.line && s.range.end.line >= position.line) {
                bestAny = s;
                if (CALLABLE_KINDS.has(s.kind)) {
                    bestCallable = s;
                }
                walk(s.children);
            }
        }
    };
    walk(cache.get(key)!);

    const chosen = bestCallable ?? bestAny;
    return chosen && { name: chosen.name, uri, range: chosen.range, selectionRange: chosen.selectionRange };
}

async function edgeBetween(a: EnclosingSymbol | undefined, b: EnclosingSymbol | undefined): Promise<EdgeKind> {
    if (!a || !b) {
        return 'next';
    }
    if (a.uri.toString() === b.uri.toString() && a.range.isEqual(b.range)) {
        return 'same';
    }
    if (await calls(a, b)) {
        return 'calls';
    }
    if (await calls(b, a)) {
        return 'returns';
    }
    return 'next';
}

async function calls(from: EnclosingSymbol, to: EnclosingSymbol): Promise<boolean> {
    try {
        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
            'vscode.prepareCallHierarchy', from.uri, from.selectionRange.start
        );
        if (items && items.length > 0) {
            const outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
                'vscode.provideOutgoingCalls', items[0]
            );
            if (outgoing?.some(c => c.to.uri.toString() === to.uri.toString() && to.range.contains(c.to.selectionRange.start))) {
                return true;
            }
        }
    } catch { /* fall through to text heuristic */ }

    // Languages without a call hierarchy provider (C#, Ruby, PHP...) still get a best guess.
    try {
        const doc = await vscode.workspace.openTextDocument(from.uri);
        const name = to.name.replace(/\(.*$/s, '').split('.').pop()?.trim();
        if (!name) {
            return false;
        }
        const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(<[^>()]*>)?\\s*\\(`);
        const body = doc.getText(new vscode.Range(from.selectionRange.end, from.range.end));
        return pattern.test(body);
    } catch {
        return false;
    }
}

function displayFile(step: PathStep): string {
    const fsPath = step.resourceUri?.fsPath ?? '';
    return step.resourceUri ? vscode.workspace.asRelativePath(step.resourceUri) : path.basename(fsPath);
}

function mermaidText(text: string): string {
    return text
        .replace(/"/g, '#quot;')
        .replace(/</g, '#lt;')
        .replace(/>/g, '#gt;');
}

const MERMAID_KIND_COLORS: Record<string, string> = { new: '#2da44e', changed: '#bf8700', test: '#8250df' };

export function toMermaid(codePath: CodePath, infos: StepInfo[], fileOf: (step: PathStep) => string = displayFile): string {
    const lines = ['```mermaid', 'flowchart TD'];
    const files = new Map<string, number[]>();
    codePath.steps.forEach((step, i) => {
        const file = fileOf(step);
        files.set(file, [...(files.get(file) ?? []), i]);
    });

    let f = 0;
    for (const [file, indexes] of files) {
        lines.push(`    subgraph f${f++}["${mermaidText(file)}"]`);
        for (const i of indexes) {
            const step = codePath.steps[i];
            const kindTag = step.kind && step.kind !== 'context' ? ` (${step.kind})` : '';
            const parts = [`${step.stepNumber}. ${infos[i]?.symbol ?? `line ${step.lineNumber}`}${kindTag}`];
            if (step.customLabel) {
                parts.push(step.customLabel);
            }
            lines.push(`        s${i + 1}["${parts.map(mermaidText).join('<br/>')}"]`);
        }
        lines.push('    end');
    }

    for (let i = 0; i < codePath.steps.length - 1; i++) {
        const from = `s${i + 1}`;
        const to = `s${i + 2}`;
        switch (infos[i]?.edge) {
            case 'calls': lines.push(`    ${from} -->|calls| ${to}`); break;
            case 'returns': lines.push(`    ${from} -.->|returns to| ${to}`); break;
            case 'same': lines.push(`    ${from} --> ${to}`); break;
            default: lines.push(`    ${from} -.-> ${to}`);
        }
    }

    for (const [kind, color] of Object.entries(MERMAID_KIND_COLORS)) {
        const ids = codePath.steps.flatMap((s, i) => (s.kind === kind ? [`s${i + 1}`] : []));
        if (ids.length > 0) {
            // Stroke only, so the diagram reads in both light and dark themes.
            lines.push(`    classDef ${kind} stroke:${color},stroke-width:2px`);
            lines.push(`    class ${ids.join(',')} ${kind}`);
        }
    }
    lines.push('```');
    return lines.join('\n');
}

export async function copyPathAsMermaid(codePath: CodePath) {
    const infos = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Pathfinder: analysing code path' },
        () => analyzePath(codePath)
    );
    await vscode.env.clipboard.writeText(toMermaid(codePath, infos));
    vscode.window.showInformationMessage(`Copied "${codePath.label}" as a Mermaid diagram.`);
}

export class PathMapPanel implements vscode.Disposable {
    private static instance: PathMapPanel | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private renderToken = 0;

    static visibleColumn(): vscode.ViewColumn | undefined {
        const panel = PathMapPanel.instance?.panel;
        return panel?.visible ? panel.viewColumn : undefined;
    }

    static show(provider: PathfinderDataProvider, pathId: string) {
        if (PathMapPanel.instance) {
            PathMapPanel.instance.pathId = pathId;
            PathMapPanel.instance.panel.reveal(undefined, true);
            PathMapPanel.instance.render();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'pathfinderPathMap',
            'Path Map',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        );
        PathMapPanel.instance = new PathMapPanel(panel, provider, pathId);
    }

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly provider: PathfinderDataProvider,
        private pathId: string
    ) {
        panel.webview.html = shellHtml();
        this.disposables.push(
            panel.onDidDispose(() => this.dispose()),
            panel.webview.onDidReceiveMessage(msg => this.onMessage(msg)),
            provider.onDidChangeTreeData(() => this.render()),
            provider.onDidChangeCurrentStep(step => {
                // Follow the tour into whichever path the user is now walking.
                if (step?.pathId && step.pathId !== this.pathId) {
                    this.pathId = step.pathId;
                }
                this.render();
            })
        );
    }

    private async onMessage(msg: { type: string; stepNumber?: number }) {
        if (msg.type === 'ready') {
            await this.render();
        } else if (msg.type === 'open' && msg.stepNumber !== undefined) {
            await vscode.commands.executeCommand('pathfinder.goToStep', this.pathId, msg.stepNumber);
        } else if (msg.type === 'mermaid') {
            const codePath = this.provider.getCodePath(this.pathId);
            if (codePath) {
                await copyPathAsMermaid(codePath);
            }
        }
    }

    private async render() {
        const codePath = this.provider.getCodePath(this.pathId);
        if (!codePath) {
            this.panel.webview.postMessage({ type: 'render', model: null });
            return;
        }
        this.panel.title = `Path Map: ${codePath.label}`;
        const token = ++this.renderToken;

        const cached = getCachedAnalysis(codePath);
        this.panel.webview.postMessage({ type: 'render', model: this.model(codePath, cached ?? [], !cached) });
        if (!cached) {
            const infos = await analyzePath(codePath);
            if (token === this.renderToken) {
                this.panel.webview.postMessage({ type: 'render', model: this.model(codePath, infos, false) });
            }
        }
    }

    private model(codePath: CodePath, infos: StepInfo[], analysing: boolean) {
        const current = this.provider.getCurrentStep();
        return {
            label: codePath.label,
            color: /^[\w.]+$/.test(codePath.colorName) ? `--vscode-${codePath.colorName.replace(/\./g, '-')}` : '',
            summary: codePath.summary ?? '',
            analysing,
            steps: codePath.steps.map((step, i) => ({
                stepNumber: step.stepNumber,
                file: displayFile(step),
                line: step.lineNumber,
                note: step.customLabel ?? '',
                detail: step.detail ?? '',
                symbol: infos[i]?.symbol ?? '',
                edge: infos[i]?.edge ?? (i < codePath.steps.length - 1 ? 'next' : undefined),
                reviewed: !!step.reviewed,
                kind: step.kind ?? '',
                current: step === current
            }))
        };
    }

    dispose() {
        PathMapPanel.instance = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

function shellHtml(): string {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 12px 16px 32px; }
  header { position: sticky; top: 0; background: var(--vscode-editor-background); padding-bottom: 10px; z-index: 1; }
  h1 { font-size: 1.15em; margin: 0 0 4px; padding-left: 8px; border-left: 4px solid var(--path-color, var(--vscode-textLink-foreground)); }
  .kind { font-family: var(--vscode-font-family); font-size: .75em; font-weight: 600; padding: 0 5px; border-radius: 3px; border: 1px solid currentColor; margin-left: 4px; vertical-align: 1px; }
  .kind-new { color: var(--vscode-gitDecoration-addedResourceForeground); }
  .kind-changed { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
  .kind-context { color: var(--vscode-descriptionForeground); }
  .kind-test { color: var(--vscode-charts-purple); }
  .summary { color: var(--vscode-descriptionForeground); white-space: pre-wrap; margin: 6px 0 10px; padding-left: 8px; border-left: 2px solid var(--vscode-textBlockQuote-border, #8886); }
  .summary-label { display: block; font-size: .8em; text-transform: uppercase; letter-spacing: .04em; opacity: .8; margin-bottom: 2px; }
  .bar { height: 4px; background: var(--vscode-editorWidget-border, #8884); border-radius: 2px; overflow: hidden; }
  .bar > div { height: 100%; background: var(--path-color, var(--vscode-progressBar-background)); transition: width .2s; }
  .meta { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; color: var(--vscode-descriptionForeground); font-size: .9em; }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 0; padding: 3px 8px; border-radius: 2px; cursor: pointer; font: inherit; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .file { margin: 14px 0 6px; font-family: var(--vscode-editor-font-family); font-size: .85em; color: var(--vscode-textLink-foreground); }
  .node { display: flex; gap: 10px; padding: 8px 10px; border: 1px solid var(--vscode-editorWidget-border, #8884); border-radius: 4px; cursor: pointer; background: var(--vscode-editorWidget-background); }
  .node:hover { border-color: var(--vscode-focusBorder); }
  .node.current { border-color: var(--vscode-textLink-foreground); box-shadow: 0 0 0 1px var(--vscode-textLink-foreground); }
  .node.reviewed .num { background: var(--vscode-testing-iconPassed, #3fb950); color: var(--vscode-editor-background); }
  .num { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: .8em; font-weight: 600; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .node.current .num { background: var(--vscode-textLink-foreground); color: var(--vscode-editor-background); }
  .body { min-width: 0; }
  .sym { font-family: var(--vscode-editor-font-family); font-weight: 600; overflow-wrap: anywhere; }
  .line { color: var(--vscode-descriptionForeground); font-weight: normal; }
  .note { margin-top: 2px; }
  .detail { margin-top: 4px; color: var(--vscode-descriptionForeground); white-space: pre-wrap; font-size: .92em; }
  .edge { margin-left: 20px; padding: 4px 0 4px 14px; border-left: 2px solid var(--vscode-descriptionForeground); color: var(--vscode-descriptionForeground); font-size: .85em; }
  .edge.next, .edge.returns { border-left-style: dashed; }
  .edge.next { opacity: .6; }
  .edge.calls { border-left-color: var(--vscode-textLink-foreground); color: var(--vscode-textLink-foreground); }
  .empty { color: var(--vscode-descriptionForeground); margin-top: 24px; }
</style>
</head>
<body>
<div id="root"><p class="empty">Loading…</p></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const edgeText = (kind, next) => ({
    calls: 'calls ' + (next.symbol || 'next step'),
    returns: 'returns to ' + (next.symbol || 'caller'),
    same: 'continues in the same function',
    next: 'then'
  })[kind] || '';

  window.addEventListener('message', ({ data }) => {
    if (data.type !== 'render') return;
    const m = data.model;
    if (!m) { root.innerHTML = '<p class="empty">This code path no longer exists.</p>'; return; }
    const total = m.steps.length;
    const currentIndex = m.steps.findIndex(s => s.current);
    const reviewed = m.steps.filter(s => s.reviewed).length;
    const position = currentIndex >= 0 ? currentIndex + 1 : 0;
    let html = '<header><h1>' + esc(m.label) + '</h1>'
      + (m.summary ? '<div class="summary"><span class="summary-label">Summary</span>' + esc(m.summary) + '</div>' : '')
      + '<div class="bar"><div id="progress"></div></div>'
      + '<div class="meta"><span>' + (position ? 'Step ' + position + ' of ' + total : total + ' steps')
      + (reviewed ? ' · ' + reviewed + ' reviewed' : '') + (m.analysing ? ' · analysing calls…' : '') + '</span>'
      + '<button id="mermaid">Copy as Mermaid</button></div></header>';
    let lastFile = null;
    m.steps.forEach((s, i) => {
      if (s.file !== lastFile) { html += '<div class="file">' + esc(s.file) + '</div>'; lastFile = s.file; }
      html += '<div class="node' + (s.current ? ' current' : '') + (s.reviewed ? ' reviewed' : '') + '" data-step="' + s.stepNumber + '">'
        + '<div class="num">' + (s.reviewed ? '✓' : s.stepNumber) + '</div><div class="body">'
        + '<div class="sym">' + esc(s.symbol || 'Step ' + s.stepNumber) + ' <span class="line">:' + s.line + '</span>'
        + (s.kind ? '<span class="kind kind-' + esc(s.kind) + '">' + esc(s.kind) + '</span>' : '') + '</div>'
        + (s.note ? '<div class="note">' + esc(s.note) + '</div>' : '')
        + (s.detail ? '<div class="detail">' + esc(s.detail) + '</div>' : '')
        + '</div></div>';
      if (s.edge && i < total - 1) {
        html += '<div class="edge ' + s.edge + '">' + esc(edgeText(s.edge, m.steps[i + 1])) + '</div>';
      }
    });
    root.innerHTML = html;
    if (m.color) document.documentElement.style.setProperty('--path-color', 'var(' + m.color + ')');
    else document.documentElement.style.removeProperty('--path-color');
    document.getElementById('progress').style.width = (total ? (position / total) * 100 : 0) + '%';
    root.querySelectorAll('.node').forEach(el => el.addEventListener('click', () =>
      vscode.postMessage({ type: 'open', stepNumber: Number(el.dataset.step) })));
    document.getElementById('mermaid').addEventListener('click', () => vscode.postMessage({ type: 'mermaid' }));
    const cur = root.querySelector('.node.current');
    if (cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
