import * as vscode from 'vscode';
import { CallNode, CallDepth } from './models/CallNode';

export class CallHierarchyProvider implements vscode.TreeDataProvider<CallNode>, vscode.Disposable {
    private _onDidChangeTreeData = new vscode.EventEmitter<CallNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private maxDepth: CallDepth = 3;
    private disposables: vscode.Disposable[] = [];
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private suppressNextRefreshFlag = false;
    // Nodes whose getChildren() returned [] — rendered as leaves (no expand arrow)
    private emptyNodes = new WeakSet<CallNode>();
    // Nodes created via the fallback path — children resolved via definition provider
    private fallbackNodes = new WeakSet<CallNode>();
    // Cache of the last-built root nodes and the file they belong to
    private cachedRoots: CallNode[] = [];
    private baseUri: vscode.Uri | undefined;
    // Message to surface in the tree view (e.g. unsupported language server)
    private _statusMessage: string | undefined;

    readonly onDidChangeMessage = new vscode.EventEmitter<string | undefined>();

    constructor() {
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.debouncedRefresh()),
            vscode.workspace.onDidSaveTextDocument(() => this.debouncedRefresh())
        );
    }

    suppressNextRefresh(): void {
        this.suppressNextRefreshFlag = true;
    }

    setDepth(depth: CallDepth): void {
        this.maxDepth = depth;
        this.emptyNodes = new WeakSet<CallNode>();
        this.fallbackNodes = new WeakSet<CallNode>();
        this._onDidChangeTreeData.fire();
    }

    getDepth(): CallDepth {
        return this.maxDepth;
    }

    getBaseUri(): vscode.Uri | undefined {
        return this.baseUri;
    }

    /** Find the root node whose callItem.range contains the given position. */
    getNodeAtPosition(position: vscode.Position): CallNode | undefined {
        return this.cachedRoots.find(node => node.callItem.range.contains(position));
    }

    refresh(): void {
        this.emptyNodes = new WeakSet<CallNode>();
        this.fallbackNodes = new WeakSet<CallNode>();
        this._onDidChangeTreeData.fire();
    }

    private resetAndFire(): void {
        this.emptyNodes = new WeakSet<CallNode>();
        this.fallbackNodes = new WeakSet<CallNode>();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CallNode): vscode.TreeItem {
        if (this.emptyNodes.has(element)) {
            element.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }
        return element;
    }

    getParent(element: CallNode): CallNode | undefined {
        return element.parent;
    }

    async getChildren(element?: CallNode): Promise<CallNode[]> {
        if (!element) {
            return this.getRootNodes();
        }
        return this.getOutgoingCallNodes(element);
    }

    private async getRootNodes(): Promise<CallNode[]> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.cachedRoots = [];
            this.baseUri = undefined;
            return [];
        }

        let symbols: vscode.DocumentSymbol[] | undefined;
        try {
            symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                editor.document.uri
            );
        } catch {
            return [];
        }

        if (!symbols || symbols.length === 0) {
            this.setMessage(undefined);
            return [];
        }

        const methods = extractCallableSymbols(symbols);
        // Guarantee document order regardless of what the LSP returns
        methods.sort((a, b) => a.range.start.line - b.range.start.line);

        const nodes: CallNode[] = [];

        for (const symbol of methods) {
            try {
                const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                    'vscode.prepareCallHierarchy',
                    editor.document.uri,
                    symbol.selectionRange.start
                );
                if (items && items.length > 0) {
                    const hint = symbol.detail
                        ? compactSignature(symbol.detail, symbol.name)
                        : await resolveSignatureFromDocument(items[0]);
                    nodes.push(new CallNode(items[0], 1, this.maxDepth, true, hint));
                }
            } catch {
                // Language server may not support call hierarchy for this symbol
            }
        }

        // If the language server found methods but couldn't prepare call hierarchy
        // for any of them, fall back to a best-effort list built from the
        // DocumentSymbol data with children resolved via definition provider.
        if (methods.length > 0 && nodes.length === 0) {
            for (const symbol of methods) {
                // Don't pass a hint: the symbol name from many language servers
                // (e.g. C#) already includes the parameter list and return type,
                // so appending detail would produce garbled labels.
                const fallbackItem = new vscode.CallHierarchyItem(
                    symbol.kind,
                    symbol.name,
                    symbol.detail || '',
                    editor.document.uri,
                    symbol.range,
                    symbol.selectionRange
                );
                const node = new CallNode(fallbackItem, 1, this.maxDepth, true, undefined);
                this.fallbackNodes.add(node);
                nodes.push(node);
            }
            this.setMessage(
                'Call hierarchy is not natively supported for this language — showing best-effort results using definition lookup. Expansion may be incomplete.'
            );
            this.baseUri = editor.document.uri;
            this.cachedRoots = nodes;
            return nodes;
        }
        this.setMessage(undefined);

        // Pre-fetch whether each root has any workspace children so we don't show
        // an expand arrow on methods that only call external code.
        const excludeExternal = vscode.workspace.getConfiguration('pathfinder')
            .get<boolean>('callHierarchy.excludeExternalPackages', true);
        await Promise.all(nodes.map(async node => {
            if (node.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
                const hasChildren = await hasOutgoingWorkspaceCalls(node.callItem, excludeExternal);
                if (!hasChildren) {
                    node.collapsibleState = vscode.TreeItemCollapsibleState.None;
                    this.emptyNodes.add(node);
                }
            }
        }));

        this.baseUri = editor.document.uri;
        this.cachedRoots = nodes;
        return nodes;
    }

    private async getOutgoingCallNodes(node: CallNode): Promise<CallNode[]> {
        const nextDepth = node.nodeDepth + 1;
        if (nextDepth > this.maxDepth) {
            return [];
        }

        if (this.fallbackNodes.has(node)) {
            return this.getFallbackChildren(node);
        }

        let outgoing: vscode.CallHierarchyOutgoingCall[] | undefined;
        try {
            outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
                'vscode.provideOutgoingCalls',
                node.callItem
            );
        } catch {
            return [];
        }

        if (!outgoing || outgoing.length === 0) {
            this.markEmpty(node);
            return [];
        }

        const excludeExternal = vscode.workspace.getConfiguration('pathfinder')
            .get<boolean>('callHierarchy.excludeExternalPackages', true);

        // Build the set of ancestor method identifiers to detect recursive cycles
        const ancestorKeys = new Set<string>();
        let ancestor: CallNode | undefined = node;
        while (ancestor) {
            ancestorKeys.add(`${ancestor.callItem.uri.toString()}::${ancestor.callItem.selectionRange.start.line}`);
            ancestor = ancestor.parent;
        }

        const seen = new Set<string>();
        const result: CallNode[] = [];

        for (const call of outgoing) {
            if (excludeExternal && !isInWorkspace(call.to.uri)) {
                continue;
            }
            const key = `${call.to.uri.toString()}::${call.to.selectionRange.start.line}::${call.to.name}`;
            if (!seen.has(key)) {
                seen.add(key);
                const hint = await resolveSignatureHint(call.to);
                const childKey = `${call.to.uri.toString()}::${call.to.selectionRange.start.line}`;
                const isRecursive = ancestorKeys.has(childKey);
                const child = new CallNode(call.to, nextDepth, this.maxDepth, false, hint, isRecursive);
                child.parent = node;
                result.push(child);
            }
        }

        if (result.length === 0) {
            this.markEmpty(node);
            return [];
        }

        // For children that could have grandchildren (i.e. not already at maxDepth),
        // pre-fetch their outgoing calls in parallel so we can set collapsibleState = None
        // immediately — without this the expand arrow briefly appears then vanishes on click.
        if (nextDepth < this.maxDepth) {
            await Promise.all(result.map(async child => {
                // Recursive nodes are already marked as leaves; skip pre-fetch.
                if (child.collapsibleState === vscode.TreeItemCollapsibleState.None) { return; }
                const hasGrandchildren = await hasOutgoingWorkspaceCalls(child.callItem, excludeExternal);
                if (!hasGrandchildren) {
                    child.collapsibleState = vscode.TreeItemCollapsibleState.None;
                    this.emptyNodes.add(child);
                }
            }));
        }

        return result;
    }

    /** Mark a node as a leaf and immediately signal VS Code to re-render it without an expand arrow. */
    private markEmpty(node: CallNode): void {
        if (!this.emptyNodes.has(node)) {
            this.emptyNodes.add(node);
            node.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this._onDidChangeTreeData.fire(node);
        }
    }

    private async getFallbackChildren(node: CallNode): Promise<CallNode[]> {
        const nextDepth = node.nodeDepth + 1;

        let document: vscode.TextDocument;
        try {
            document = await vscode.workspace.openTextDocument(node.callItem.uri);
        } catch {
            this.markEmpty(node);
            return [];
        }

        // Build the set of ancestor keys to detect recursive cycles
        const ancestorKeys = new Set<string>();
        let ancestor: CallNode | undefined = node;
        while (ancestor) {
            ancestorKeys.add(`${ancestor.callItem.uri.toString()}::${ancestor.callItem.selectionRange.start.line}`);
            ancestor = ancestor.parent;
        }

        // Scan only the method BODY (after the opening `{` or `=>`), not the
        // signature line. Without this, the method's own name in its declaration
        // resolves back to itself and is falsely shown as a "(recursive)" child.
        const scanRange = methodBodyRange(document, node.callItem.range);
        const calls = await getCallsViaDefinitionProvider(document, scanRange, ancestorKeys);

        if (calls.length === 0) {
            this.markEmpty(node);
            return [];
        }

        const result: CallNode[] = [];
        for (const { item, isRecursive } of calls) {
            const child = new CallNode(item, nextDepth, this.maxDepth, false, undefined, isRecursive);
            child.parent = node;
            this.fallbackNodes.add(child);
            result.push(child);
        }
        return result;
    }

    private debouncedRefresh(): void {
        if (this.suppressNextRefreshFlag) {
            this.suppressNextRefreshFlag = false;
            return;
        }
        // If focus moved away from a text editor (e.g. to the sidebar) but the
        // panel already has content, keep showing it — don't clear on focus-out.
        if (!vscode.window.activeTextEditor && this.baseUri) { return; }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => this.resetAndFire(), 400);
    }

    private setMessage(msg: string | undefined): void {
        if (this._statusMessage !== msg) {
            this._statusMessage = msg;
            this.onDidChangeMessage.fire(msg);
        }
    }

    getStatusMessage(): string | undefined {
        return this._statusMessage;
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this._onDidChangeTreeData.dispose();
        this.onDidChangeMessage.dispose();
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
    }
}

/**
 * Returns the sub-range of `fullRange` that starts after the method signature,
 * i.e. from the first `{` (block body) or `=>` (expression body) to the end.
 * Scanning only the body prevents the method's own name in its declaration
 * line from being resolved as a call site and falsely flagged as recursive.
 */
export function methodBodyRange(document: vscode.TextDocument, fullRange: vscode.Range): vscode.Range {
    const text = document.getText(fullRange);
    const braceIdx = text.indexOf('{');
    const arrowIdx = text.indexOf('=>');
    let bodyStart = -1;
    if (braceIdx !== -1 && (arrowIdx === -1 || braceIdx < arrowIdx)) {
        bodyStart = braceIdx + 1;
    } else if (arrowIdx !== -1) {
        bodyStart = arrowIdx + 2;
    }
    if (bodyStart <= 0) { return fullRange; }
    const startOffset = document.offsetAt(fullRange.start) + bodyStart;
    return new vscode.Range(document.positionAt(startOffset), fullRange.end);
}

export const MAX_CALL_SITES = 50;

/** Regex that matches potential call sites: an identifier immediately followed by `(`. */
export const CALL_SITE_REGEX = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

/**
 * Scan `text` for call-site candidates and return the char-offset of each
 * identifier start (i.e. the index of the first letter of the callee name).
 * Exported for unit testing; the caller is responsible for capping results.
 */
export function findCallSiteOffsets(text: string, max = MAX_CALL_SITES): number[] {
    const re = new RegExp(CALL_SITE_REGEX.source, 'g');
    const offsets: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && offsets.length < max) {
        offsets.push(m.index);
    }
    return offsets;
}

async function getCallsViaDefinitionProvider(
    document: vscode.TextDocument,
    methodRange: vscode.Range,
    ancestorKeys: Set<string>
): Promise<Array<{ item: vscode.CallHierarchyItem; isRecursive: boolean }>> {
    const bodyText = document.getText(methodRange);
    const startOffset = document.offsetAt(methodRange.start);
    const offsets = findCallSiteOffsets(bodyText);

    const seen = new Set<string>();
    const results: Array<{ item: vscode.CallHierarchyItem; isRecursive: boolean }> = [];

    for (const offset of offsets) {
        const position = document.positionAt(startOffset + offset);

        let locations: (vscode.Location | vscode.LocationLink)[] | undefined;
        try {
            locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
                'vscode.executeDefinitionProvider',
                document.uri,
                position
            );
        } catch {
            continue;
        }

        if (!locations || locations.length === 0) { continue; }

        for (const loc of locations) {
            let targetUri: vscode.Uri;
            let targetRange: vscode.Range;

            if ('targetUri' in loc) {
                // LocationLink
                targetUri = loc.targetUri;
                targetRange = loc.targetSelectionRange ?? loc.targetRange;
            } else {
                // Location
                targetUri = loc.uri;
                targetRange = loc.range;
            }

            if (!isInWorkspace(targetUri)) { continue; }

            let symbols: vscode.DocumentSymbol[] | undefined;
            try {
                symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    targetUri
                );
            } catch {
                continue;
            }

            if (!symbols) { continue; }

            const callables = extractCallableSymbols(symbols);
            const sym = callables.find(s => s.selectionRange.start.line === targetRange.start.line);
            if (!sym) { continue; }

            const key = `${targetUri.toString()}::${sym.selectionRange.start.line}`;
            if (seen.has(key)) { continue; }
            seen.add(key);

            const isRecursive = ancestorKeys.has(key);
            const item = new vscode.CallHierarchyItem(
                sym.kind,
                sym.name,
                sym.detail || '',
                targetUri,
                sym.range,
                sym.selectionRange
            );
            results.push({ item, isRecursive });
        }
    }

    return results;
}

function extractCallableSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
    const result: vscode.DocumentSymbol[] = [];
    for (const symbol of symbols) {
        if (
            symbol.kind === vscode.SymbolKind.Function ||
            symbol.kind === vscode.SymbolKind.Method ||
            symbol.kind === vscode.SymbolKind.Constructor
        ) {
            result.push(symbol);
        }
        if (symbol.children && symbol.children.length > 0) {
            result.push(...extractCallableSymbols(symbol.children));
        }
    }
    return result;
}

/** Returns true if item has at least one outgoing call that passes the workspace filter. */
async function hasOutgoingWorkspaceCalls(item: vscode.CallHierarchyItem, excludeExternal: boolean): Promise<boolean> {
    try {
        const outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
            'vscode.provideOutgoingCalls',
            item
        );
        if (!outgoing || outgoing.length === 0) { return false; }
        if (!excludeExternal) { return true; }
        return outgoing.some(call => isInWorkspace(call.to.uri));
    } catch {
        return false;
    }
}

export function isInWorkspace(uri: vscode.Uri): boolean {
    const fsPath = uri.fsPath;

    // node_modules is never user code, even when inside the workspace root
    if (fsPath.includes('/node_modules/') || fsPath.includes('\\node_modules\\')) {
        return false;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        // No workspace open — show everything rather than hiding too much
        return true;
    }

    // Use case-insensitive comparison on Windows: VS Code workspace folder paths
    // consistently use lowercase drive letters (e.g. c:\project) but the TypeScript
    // language server returns call hierarchy URIs with uppercase drive letters
    // (e.g. C:\project\src\file.ts), so a plain startsWith check always fails there.
    const normalize = (p: string) => process.platform === 'win32' ? p.toLowerCase() : p;
    const normalizedPath = normalize(fsPath);
    return folders.some(f => normalizedPath.startsWith(normalize(f.uri.fsPath)));
}

async function resolveSignatureHint(item: vscode.CallHierarchyItem): Promise<string | undefined> {
    if (item.detail && item.detail.includes('(')) {
        return compactSignature(item.detail, item.name);
    }
    return resolveSignatureFromDocument(item);
}

async function resolveSignatureFromDocument(item: vscode.CallHierarchyItem): Promise<string | undefined> {
    try {
        const doc = await vscode.workspace.openTextDocument(item.uri);
        const startLine = item.range.start.line;
        const endLine = Math.min(item.range.end.line, startLine + 5);
        let text = '';
        for (let l = startLine; l <= endLine; l++) {
            text += doc.lineAt(l).text + ' ';
        }

        const nameIdx = text.indexOf(item.name);
        if (nameIdx === -1) { return undefined; }
        const parenStart = text.indexOf('(', nameIdx + item.name.length);
        if (parenStart === -1) { return undefined; }

        let depth = 0;
        let parenEnd = -1;
        for (let i = parenStart; i < text.length; i++) {
            if (text[i] === '(') { depth++; }
            else if (text[i] === ')') {
                depth--;
                if (depth === 0) { parenEnd = i; break; }
            }
        }
        if (parenEnd === -1) { return undefined; }

        const params = text.slice(parenStart + 1, parenEnd).trim();
        if (!params) { return '()'; }
        return `(${params.replace(/\s+/g, ' ')})`;
    } catch {
        return undefined;
    }
}

export function compactSignature(detail: string, methodName?: string): string {
    let searchFrom = 0;
    if (methodName) {
        const nameIdx = detail.indexOf(methodName);
        if (nameIdx !== -1) {
            searchFrom = nameIdx + methodName.length;
        }
    }

    const open = detail.indexOf('(', searchFrom);
    if (open === -1) { return detail.trim(); }

    let depth = 0;
    let close = -1;
    for (let i = open; i < detail.length; i++) {
        if (detail[i] === '(') { depth++; }
        else if (detail[i] === ')') {
            depth--;
            if (depth === 0) { close = i; break; }
        }
    }
    if (close === -1) { return detail.trim(); }
    return `(${detail.slice(open + 1, close).replace(/\s+/g, ' ').trim()})`;
}
