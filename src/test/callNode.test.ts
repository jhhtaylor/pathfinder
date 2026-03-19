import * as assert from 'assert';
import * as vscode from 'vscode';
import { CallNode } from '../models/CallNode';

function makeCallItem(
    name: string,
    filePath: string,
    line: number = 0,
    kind: vscode.SymbolKind = vscode.SymbolKind.Method
): vscode.CallHierarchyItem {
    const uri = vscode.Uri.file(filePath);
    const pos = new vscode.Position(line, 0);
    const range = new vscode.Range(pos, new vscode.Position(line + 10, 0));
    const selRange = new vscode.Range(pos, pos);
    return new vscode.CallHierarchyItem(kind, name, '', uri, range, selRange);
}

suite('CallNode Test Suite', () => {

    // ── collapsibleState ──────────────────────────────────────────────────────

    test('collapsed when nodeDepth < maxDepth', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts'), 1, 3, false);
        assert.strictEqual(node.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    });

    test('none when nodeDepth equals maxDepth', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts'), 3, 3, false);
        assert.strictEqual(node.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });

    test('none when nodeDepth exceeds maxDepth', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts'), 4, 3, false);
        assert.strictEqual(node.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });

    test('none when isRecursive regardless of depth', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts'), 1, 3, false, undefined, true);
        assert.strictEqual(node.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });

    // ── label ─────────────────────────────────────────────────────────────────

    test('label is method name when no signature hint', () => {
        const node = new CallNode(makeCallItem('myMethod', '/a.ts'), 1, 3, false);
        assert.strictEqual(node.label, 'myMethod');
    });

    test('label appends signature hint', () => {
        const node = new CallNode(makeCallItem('myMethod', '/a.ts'), 1, 3, false, '(a: string)');
        assert.strictEqual(node.label, 'myMethod(a: string)');
    });

    test('label includes "(recursive)" when isRecursive', () => {
        const node = new CallNode(makeCallItem('myMethod', '/a.ts'), 1, 3, false, undefined, true);
        assert.ok((node.label as string).includes('(recursive)'));
    });

    test('recursive label still includes method name', () => {
        const node = new CallNode(makeCallItem('myMethod', '/a.ts'), 1, 3, false, undefined, true);
        assert.ok((node.label as string).startsWith('myMethod'));
    });

    test('recursive label includes signature hint', () => {
        const node = new CallNode(makeCallItem('myMethod', '/a.ts'), 1, 3, false, '(x: number)', true);
        assert.ok((node.label as string).includes('myMethod(x: number)'));
        assert.ok((node.label as string).includes('(recursive)'));
    });

    // ── contextValue ──────────────────────────────────────────────────────────

    test('contextValue is callNodeRoot for root nodes', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts'), 1, 3, true);
        assert.strictEqual(node.contextValue, 'callNodeRoot');
    });

    test('contextValue is callNode for non-root nodes', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts'), 2, 3, false);
        assert.strictEqual(node.contextValue, 'callNode');
    });

    // ── description ───────────────────────────────────────────────────────────

    test('description is undefined for root nodes', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts'), 1, 3, true);
        assert.strictEqual(node.description, undefined);
    });

    test('description includes 1-indexed line number for non-root nodes', () => {
        // selectionRange starts at line 9, so displayed line should be 10
        const node = new CallNode(makeCallItem('fn', '/a.ts', 9), 2, 3, false);
        assert.ok((node.description as string).includes(':10'));
    });

    // ── icon ──────────────────────────────────────────────────────────────────

    test('iconPath is ThemeIcon("refresh") for recursive nodes', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts'), 1, 3, false, undefined, true);
        assert.ok(node.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((node.iconPath as vscode.ThemeIcon).id, 'refresh');
    });

    test('iconPath is symbol-method for Method kind', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts', 0, vscode.SymbolKind.Method), 1, 3, false);
        assert.ok(node.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((node.iconPath as vscode.ThemeIcon).id, 'symbol-method');
    });

    test('iconPath is symbol-function for Function kind', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts', 0, vscode.SymbolKind.Function), 1, 3, false);
        assert.ok(node.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((node.iconPath as vscode.ThemeIcon).id, 'symbol-function');
    });

    test('iconPath is symbol-constructor for Constructor kind', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts', 0, vscode.SymbolKind.Constructor), 1, 3, false);
        assert.ok(node.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((node.iconPath as vscode.ThemeIcon).id, 'symbol-constructor');
    });

    // ── parent / callItem ─────────────────────────────────────────────────────

    test('parent is undefined by default', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts'), 1, 3, false);
        assert.strictEqual(node.parent, undefined);
    });

    test('parent can be assigned', () => {
        const item = makeCallItem('parent', '/a.ts');
        const parent = new CallNode(item, 1, 3, true);
        const child = new CallNode(makeCallItem('child', '/a.ts'), 2, 3, false);
        child.parent = parent;
        assert.strictEqual(child.parent, parent);
    });

    test('callItem is the original CallHierarchyItem', () => {
        const item = makeCallItem('fn', '/a.ts');
        const node = new CallNode(item, 1, 3, false);
        assert.strictEqual(node.callItem, item);
    });

    test('nodeDepth is stored correctly', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts'), 2, 3, false);
        assert.strictEqual(node.nodeDepth, 2);
    });

    test('isRoot is stored correctly', () => {
        const rootNode = new CallNode(makeCallItem('fn', '/a.ts'), 1, 3, true);
        const childNode = new CallNode(makeCallItem('fn', '/a.ts'), 2, 3, false);
        assert.strictEqual(rootNode.isRoot, true);
        assert.strictEqual(childNode.isRoot, false);
    });

    // ── command ───────────────────────────────────────────────────────────────

    test('command navigates to the node itself', () => {
        const node = new CallNode(makeCallItem('fn', '/a.ts'), 1, 3, false);
        assert.strictEqual(node.command?.command, 'pathfinder.callHierarchy.navigateToNode');
        assert.deepStrictEqual(node.command?.arguments, [node]);
    });
});
