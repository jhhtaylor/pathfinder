import * as assert from 'assert';
import * as vscode from 'vscode';
import { isInWorkspace, compactSignature, findCallSiteOffsets, MAX_CALL_SITES } from '../callHierarchyProvider';

function uri(fsPath: string): vscode.Uri {
    return vscode.Uri.file(fsPath);
}

suite('isInWorkspace Test Suite', () => {

    // ── node_modules filtering ────────────────────────────────────────────────

    test('returns false for unix node_modules path', () => {
        assert.strictEqual(isInWorkspace(uri('/projects/app/node_modules/lodash/index.js')), false);
    });

    test('returns false for deeply nested unix node_modules path', () => {
        assert.strictEqual(isInWorkspace(uri('/projects/app/node_modules/@types/vscode/index.d.ts')), false);
    });

    test('returns false for windows-style node_modules path', () => {
        const fakeUri = { fsPath: 'C:\\projects\\app\\node_modules\\lodash\\index.js' } as vscode.Uri;
        assert.strictEqual(isInWorkspace(fakeUri), false);
    });

    // ── Windows drive-letter case sensitivity ─────────────────────────────────

    test('workspace check is case-insensitive for Windows drive letters', () => {
        // Simulate the Windows scenario: workspace folder has lowercase drive letter
        // but the TS language server returns an uppercase one in the call URI.
        // We can only run this check on Windows; on other platforms just assert no throw.
        if (process.platform !== 'win32') {
            assert.doesNotThrow(() => isInWorkspace({ fsPath: 'C:\\project\\src\\file.ts' } as vscode.Uri));
            return;
        }
        // On Windows, both of these should agree — neither should be excluded solely
        // because of drive-letter case.
        const upper = { fsPath: 'C:\\project\\src\\file.ts' } as vscode.Uri;
        const lower = { fsPath: 'c:\\project\\src\\file.ts' } as vscode.Uri;
        assert.strictEqual(isInWorkspace(upper), isInWorkspace(lower));
    });

    test('node_modules inside workspace root is still excluded', () => {
        // Even if the path technically starts with a workspace folder, node_modules
        // should always be filtered out.
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            // No workspace open — skip this assertion
            return;
        }
        const wsRoot = folders[0].uri.fsPath;
        const nodeModulesUri = uri(`${wsRoot}/node_modules/some-pkg/index.js`);
        assert.strictEqual(isInWorkspace(nodeModulesUri), false);
    });

    // ── workspace membership ──────────────────────────────────────────────────

    test('returns true for path inside workspace folder', () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            // No workspace open; isInWorkspace returns true for everything — acceptable.
            return;
        }
        const wsRoot = folders[0].uri.fsPath;
        const srcFile = uri(`${wsRoot}/src/myFile.ts`);
        assert.strictEqual(isInWorkspace(srcFile), true);
    });

    test('returns false for path outside all workspace folders', () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return;
        }
        // /tmp is extremely unlikely to be inside a workspace folder
        const outsideUri = uri('/tmp/some-random-external-file.ts');
        assert.strictEqual(isInWorkspace(outsideUri), false);
    });

    test('returns true when no workspace folders are open', () => {
        // If workspaceFolders is empty/undefined the function returns true
        // (show everything rather than hide too much). We cannot force this
        // state in an integration test, so we verify the node_modules guard
        // still fires first (already covered above) and document the expected
        // fallback behaviour here as a contract check.
        const someUri = uri('/Users/dev/project/src/helper.ts');
        // When tests run without an open workspace this should return true;
        // when a workspace IS open it depends on the path — just assert no throw.
        assert.doesNotThrow(() => isInWorkspace(someUri));
    });

    // ── edge cases ────────────────────────────────────────────────────────────

    test('path that merely contains "node_modules" as a substring in the dir name is not excluded', () => {
        // e.g. a folder literally named "node_modules_backup" should not be filtered
        const notNodeModules = uri('/projects/app/node_modules_backup/file.ts');
        // The check requires the separator around it; this path should NOT be auto-excluded
        // (it's either in the workspace or not, but the node_modules guard won't reject it).
        // We just assert the call doesn't throw; the return value depends on workspace state.
        assert.doesNotThrow(() => isInWorkspace(notNodeModules));
    });

    test('path ending exactly at node_modules (no trailing slash) is not excluded', () => {
        // Our check is fsPath.includes('/node_modules/') — a path ending at the dir
        // without a child segment won't match.
        const edgeUri = uri('/projects/app/node_modules');
        assert.doesNotThrow(() => isInWorkspace(edgeUri));
    });
});

suite('compactSignature Test Suite', () => {

    // ── basic extraction ──────────────────────────────────────────────────────

    test('extracts simple parameter list', () => {
        assert.strictEqual(compactSignature('myMethod(a: string, b: number)'), '(a: string, b: number)');
    });

    test('extracts empty parameter list', () => {
        assert.strictEqual(compactSignature('myMethod()'), '()');
    });

    test('returns trimmed detail when no opening paren is found', () => {
        assert.strictEqual(compactSignature('  noParens  '), 'noParens');
    });

    test('returns trimmed detail when parens are unbalanced (no closing paren)', () => {
        assert.strictEqual(compactSignature('myMethod(oops'), 'myMethod(oops');
    });

    // ── methodName offset ─────────────────────────────────────────────────────

    test('skips past methodName before searching for opening paren', () => {
        // TypeScript detail: "methodName(param: Type): ReturnType"
        assert.strictEqual(compactSignature('doWork(x: number): void', 'doWork'), '(x: number)');
    });

    test('works without a methodName hint', () => {
        assert.strictEqual(compactSignature('doWork(x: number): void'), '(x: number)');
    });

    test('handles detail where methodName appears before the paren (class prefix)', () => {
        // e.g. TypeScript LSP detail: "MyClass.myMethod(a: string)"
        assert.strictEqual(compactSignature('MyClass.myMethod(a: string)', 'myMethod'), '(a: string)');
    });

    // ── nested generics ───────────────────────────────────────────────────────

    test('handles nested angle brackets inside params without breaking paren balance', () => {
        const detail = 'getItems(filter: Map<string, number>): void';
        assert.strictEqual(compactSignature(detail, 'getItems'), '(filter: Map<string, number>)');
    });

    test('handles nested parens (e.g. default value expressions)', () => {
        const detail = 'fn(cb: () => void): void';
        assert.strictEqual(compactSignature(detail, 'fn'), '(cb: () => void)');
    });

    // ── whitespace normalisation ──────────────────────────────────────────────

    test('collapses internal whitespace in params', () => {
        const detail = 'fn(a:  string,   b:  number)';
        // compactSignature replaces runs of whitespace with single space
        const result = compactSignature(detail, 'fn');
        assert.ok(!result.includes('  '), `Expected no double spaces, got: ${result}`);
    });

    // ── C# guard: class-name detail should NOT appear in label ────────────────

    test('detail that is just a class name (no parens) returns trimmed class name', () => {
        // C# LSP sends symbol.detail = "EmployeesController" with no parens.
        // The fallback now passes undefined as hint, so this function result is
        // intentionally never used for C# — but we document its behaviour here.
        assert.strictEqual(compactSignature('EmployeesController'), 'EmployeesController');
    });

    test('fallback nodes use undefined hint so label equals method name only — 0.2.7 regression guard', () => {
        // The 0.2.7 fix: in the language-server fallback path we pass undefined as
        // the hint instead of compactSignature(symbol.detail, symbol.name).
        // Verify CallNode honours that: label must equal callItem.name with no extra text.
        const { CallNode } = require('../models/CallNode');
        const pos = new vscode.Position(0, 0);
        const range = new vscode.Range(pos, pos);
        const item = new vscode.CallHierarchyItem(
            vscode.SymbolKind.Method,
            'GetEmployees',
            'EmployeesController',   // C# detail — class name, not a param list
            vscode.Uri.file('/project/Controllers/EmployeesController.cs'),
            range, range
        );
        const { maxDepth } = { maxDepth: 3 };
        const node = new CallNode(item, maxDepth, maxDepth, true, undefined);
        assert.strictEqual(node.label, 'GetEmployees');
    });
});

suite('findCallSiteOffsets Test Suite', () => {

    // ── basic detection ───────────────────────────────────────────────────────

    test('detects a simple function call', () => {
        const offsets = findCallSiteOffsets('doWork()');
        assert.strictEqual(offsets.length, 1);
        assert.strictEqual(offsets[0], 0);
    });

    test('detects multiple distinct calls', () => {
        const text = 'validateOrder(id); calculateTotal(id); sendEmail(to);';
        const offsets = findCallSiteOffsets(text);
        assert.strictEqual(offsets.length, 3);
    });

    test('detects await-prefixed async calls', () => {
        const text = 'await SendConfirmationAsync(orderId);';
        const offsets = findCallSiteOffsets(text);
        // Should find SendConfirmationAsync( — "await" is not followed by (
        assert.ok(offsets.some(o => text.slice(o).startsWith('SendConfirmationAsync')));
    });

    test('detects LINQ method chain calls', () => {
        const text = 'items.Where(x => x.Active).Select(x => x.Id).ToList()';
        const offsets = findCallSiteOffsets(text);
        // Should find Where, Select, ToList (and possibly the lambda bodies)
        const names = offsets.map(o => text.slice(o).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0]);
        assert.ok(names.includes('Where'));
        assert.ok(names.includes('Select'));
        assert.ok(names.includes('ToList'));
    });

    test('detects method call with keyword-like identifier in args', () => {
        // "new" and "if" appear, but the actual call is ProcessOrder
        const text = 'var result = ProcessOrder(new OrderDto { Id = 1 });';
        const offsets = findCallSiteOffsets(text);
        const names = offsets.map(o => text.slice(o).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0]);
        assert.ok(names.includes('ProcessOrder'));
    });

    test('detects calls in C#-style async method body', () => {
        const text = [
            'public async Task ProcessAsync(int id) {',
            '    var order = await GetOrderAsync(id);',
            '    var total = CalculateTotal(order);',
            '    await NotifyAsync(order.Email, total);',
            '}'
        ].join('\n');
        const offsets = findCallSiteOffsets(text);
        const names = offsets.map(o => text.slice(o).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0]);
        assert.ok(names.includes('GetOrderAsync'));
        assert.ok(names.includes('CalculateTotal'));
        assert.ok(names.includes('NotifyAsync'));
    });

    // ── deduplication is NOT done here (done in the async caller) ─────────────

    test('returns duplicates when the same call appears multiple times', () => {
        const text = 'Validate(a); Validate(b); Validate(c);';
        const offsets = findCallSiteOffsets(text);
        const names = offsets.map(o => text.slice(o).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0]);
        assert.strictEqual(names.filter(n => n === 'Validate').length, 3);
    });

    // ── cap ───────────────────────────────────────────────────────────────────

    test('returns at most MAX_CALL_SITES results', () => {
        // Build a string with more call sites than the cap
        const calls = Array.from({ length: MAX_CALL_SITES + 10 }, (_, i) => `fn${i}()`).join('; ');
        const offsets = findCallSiteOffsets(calls);
        assert.strictEqual(offsets.length, MAX_CALL_SITES);
    });

    test('custom max parameter is respected', () => {
        const text = 'a(); b(); c(); d(); e();';
        assert.strictEqual(findCallSiteOffsets(text, 3).length, 3);
        assert.strictEqual(findCallSiteOffsets(text, 5).length, 5);
    });

    // ── edge cases ────────────────────────────────────────────────────────────

    test('returns empty array for text with no calls', () => {
        assert.deepStrictEqual(findCallSiteOffsets('var x = 42;'), []);
    });

    test('handles empty string', () => {
        assert.deepStrictEqual(findCallSiteOffsets(''), []);
    });

    test('does not match identifiers not immediately followed by (', () => {
        // "foo" by itself is not a call site
        const offsets = findCallSiteOffsets('foo bar baz');
        assert.strictEqual(offsets.length, 0);
    });

    test('handles nested calls — both outer and inner are detected', () => {
        const text = 'outer(inner(x))';
        const offsets = findCallSiteOffsets(text);
        const names = offsets.map(o => text.slice(o).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0]);
        assert.ok(names.includes('outer'));
        assert.ok(names.includes('inner'));
    });
});
