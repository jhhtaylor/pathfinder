import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

suite('Extension smoke test', function () {
    this.timeout(60000);
    let dir: string;

    suiteSetup(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pathfinder-smoke-'));
        fs.mkdirSync(path.join(dir, 'src'));
        fs.writeFileSync(path.join(dir, 'src', 'main.ts'), [
            'import { helper } from "./helper";',
            '',
            'export function main() {',
            '    return helper(2);',
            '}',
            ''
        ].join('\n'));
        fs.writeFileSync(path.join(dir, 'src', 'helper.ts'), [
            '// three lines were added above the helper since the file was written',
            '',
            '',
            'export function helper(n: number) {',
            '    return n * 2;',
            '}',
            ''
        ].join('\n'));
        fs.writeFileSync(path.join(dir, 'smoke.pathfinder.json'), JSON.stringify({
            label: 'Smoke',
            id: 'smoke',
            summary: 'Entry point to helper.',
            steps: [
                { filePath: 'src/main.ts', lineNumber: 4, codeSnippet: 'return helper(2);', customLabel: 'call', kind: 'changed' },
                { filePath: 'src/helper.ts', lineNumber: 1, codeSnippet: 'return n * 2;', customLabel: 'double', kind: 'new' }
            ]
        }));

        const ext = vscode.extensions.getExtension('jhhtaylor.pathfinder-code-paths');
        await ext?.activate();
    });

    suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('imports, re-anchors, navigates and copies', async () => {
        await vscode.commands.executeCommand('pathfinder.importFromExplorer', vscode.Uri.file(path.join(dir, 'smoke.pathfinder.json')));

        await vscode.commands.executeCommand('pathfinder.goToStep', 'smoke', 1);
        let editor = vscode.window.activeTextEditor!;
        assert.strictEqual(path.basename(editor.document.uri.fsPath), 'main.ts');
        assert.strictEqual(editor.selection.active.line + 1, 4);

        await vscode.commands.executeCommand('pathfinder.nextStep');
        editor = vscode.window.activeTextEditor!;
        assert.strictEqual(path.basename(editor.document.uri.fsPath), 'helper.ts');
        assert.strictEqual(editor.selection.active.line + 1, 5, 'step 2 should follow its snippet from line 1 to line 5');

        await vscode.commands.executeCommand('pathfinder.toggleStepReviewed', 'smoke', 1);
        await vscode.commands.executeCommand('pathfinder.showPathMap', 'smoke');

        await vscode.env.clipboard.writeText('');
        await vscode.commands.executeCommand('pathfinder.copyAsMermaid');
        const mermaid = await vscode.env.clipboard.readText();
        assert.match(mermaid, /flowchart TD/);
        assert.match(mermaid, /class s1 changed/);
        assert.match(mermaid, /class s2 new/);
    });

    test('re-importing keeps the path id so navigation still works', async () => {
        const uri = vscode.Uri.file(path.join(dir, 'smoke.pathfinder.json'));
        await vscode.commands.executeCommand('pathfinder.importFromExplorer', uri);
        await vscode.commands.executeCommand('pathfinder.importFromExplorer', uri);
        await vscode.commands.executeCommand('pathfinder.goToStep', 'smoke', 2);
        assert.strictEqual(path.basename(vscode.window.activeTextEditor!.document.uri.fsPath), 'helper.ts');
    });
});
