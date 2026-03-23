import * as vscode from 'vscode';

export type CallDepth = 1 | 3 | 100;

export class CallNode extends vscode.TreeItem {
    public readonly callItem: vscode.CallHierarchyItem;
    public readonly nodeDepth: number;
    public readonly isRoot: boolean;
    public parent: CallNode | undefined;
    /** Set when callItem is an implementation and a distinct interface/abstract
     *  declaration exists. Used by "Go to Definition" to navigate to the contract
     *  rather than the concrete class. */
    public definitionItem: vscode.CallHierarchyItem | undefined;

    constructor(
        callItem: vscode.CallHierarchyItem,
        nodeDepth: number,
        maxDepth: CallDepth,
        isRoot: boolean = false,
        signatureHint?: string,
        isRecursive: boolean = false
    ) {
        let collapsible: vscode.TreeItemCollapsibleState;
        if (isRecursive || nodeDepth >= maxDepth) {
            collapsible = vscode.TreeItemCollapsibleState.None;
        } else {
            collapsible = vscode.TreeItemCollapsibleState.Collapsed;
        }

        const baseLabel = signatureHint ? `${callItem.name}${signatureHint}` : callItem.name;
        const label = isRecursive ? `${baseLabel} (recursive)` : baseLabel;
        super(label, collapsible);

        this.callItem = callItem;
        this.nodeDepth = nodeDepth;
        this.isRoot = isRoot;

        const relativePath = vscode.workspace.asRelativePath(callItem.uri);
        const line = callItem.selectionRange.start.line + 1;
        this.description = isRoot ? undefined : `${relativePath}:${line}`;
        this.tooltip = new vscode.MarkdownString(
            `**${baseLabel}**\n\n` +
            `\`${relativePath}\` — line ${line}\n\n` +
            (isRecursive ? `_Recursive call_` : `_Click to navigate_`)
        );

        this.command = {
            command: 'pathfinder.callHierarchy.navigateToNode',
            title: 'Navigate to Method',
            arguments: [this]
        };

        this.contextValue = isRoot ? 'callNodeRoot' : 'callNode';
        this.iconPath = isRecursive
            ? new vscode.ThemeIcon('refresh')
            : iconForKind(callItem.kind);
    }
}

function iconForKind(kind: vscode.SymbolKind): vscode.ThemeIcon {
    switch (kind) {
        case vscode.SymbolKind.Constructor: return new vscode.ThemeIcon('symbol-constructor');
        case vscode.SymbolKind.Method:      return new vscode.ThemeIcon('symbol-method');
        case vscode.SymbolKind.Function:    return new vscode.ThemeIcon('symbol-function');
        case vscode.SymbolKind.Property:    return new vscode.ThemeIcon('symbol-property');
        case vscode.SymbolKind.Field:       return new vscode.ThemeIcon('symbol-field');
        default:                            return new vscode.ThemeIcon('symbol-method');
    }
}
