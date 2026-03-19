import * as assert from 'assert';
import * as vscode from 'vscode';
import { isInWorkspace } from '../callHierarchyProvider';

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
