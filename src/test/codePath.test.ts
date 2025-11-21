import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodePath } from '../models/CodePath';

suite('CodePath Model Test Suite', () => {
    test('Should create a code path with default values', () => {
        const path = new CodePath('Test Path', 'test-id');

        assert.strictEqual(path.label, 'Test Path');
        assert.strictEqual(path.id, 'test-id');
        assert.strictEqual(path.steps.length, 0);
        assert.strictEqual(path.contextValue, 'path');
    });

    test('Should update description when steps are added', () => {
        const path = new CodePath('Test Path', 'test-id');

        assert.strictEqual(path.description, '0 steps');

        path.addStep('/test/file.ts', 10);
        assert.strictEqual(path.description, '1 step');

        path.addStep('/test/file.ts', 20);
        assert.strictEqual(path.description, '2 steps');
    });

    test('Should create path step with correct properties', () => {
        const path = new CodePath('Test Path', 'test-id');
        path.addStep('/test/file.ts', 10, 5, 'console.log("test")');

        const step = path.steps[0];
        assert.strictEqual(step.stepNumber, 1);
        assert.strictEqual(step.lineNumber, 10);
        assert.strictEqual(step.columnNumber, 5);
        assert.strictEqual(step.codeSnippet, 'console.log("test")');
        assert.strictEqual(step.pathId, 'test-id');
    });

    test('Should remove step and renumber remaining steps', () => {
        const path = new CodePath('Test Path', 'test-id');
        path.addStep('/test/file.ts', 10);
        path.addStep('/test/file.ts', 20);
        path.addStep('/test/file.ts', 30);

        assert.strictEqual(path.steps.length, 3);
        assert.strictEqual(path.steps[0].stepNumber, 1);
        assert.strictEqual(path.steps[1].stepNumber, 2);
        assert.strictEqual(path.steps[2].stepNumber, 3);

        path.removeStep(2); // Remove step 2

        assert.strictEqual(path.steps.length, 2);
        assert.strictEqual(path.steps[0].stepNumber, 1);
        assert.strictEqual(path.steps[0].lineNumber, 10);
        assert.strictEqual(path.steps[1].stepNumber, 2);
        assert.strictEqual(path.steps[1].lineNumber, 30);
    });

    test('Should have correct collapsible state', () => {
        const path = new CodePath('Test Path', 'test-id');

        assert.strictEqual(path.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    });

    test('Should generate unique step IDs', () => {
        const path = new CodePath('Test Path', 'test-id');
        path.addStep('/test/file.ts', 10);
        path.addStep('/test/file.ts', 20);

        const step1Id = path.steps[0].id;
        const step2Id = path.steps[1].id;

        assert.notStrictEqual(step1Id, step2Id);
        assert.ok(step1Id?.includes('test-id'));
        assert.ok(step2Id?.includes('test-id'));
    });

    test('Should set step labels correctly', () => {
        const path = new CodePath('Test Path', 'test-id');
        path.addStep('/test/path/file.ts', 10);

        const step = path.steps[0];
        assert.ok((step.label as string).includes('Step 1'));
        assert.ok((step.label as string).includes('file.ts'));
    });

    test('Should set step description with line number', () => {
        const path = new CodePath('Test Path', 'test-id');
        path.addStep('/test/file.ts', 10);

        const step = path.steps[0];
        assert.ok((step.description as string).includes('Line 11')); // Line numbers are 0-indexed, displayed as 1-indexed
    });

    test('Should assign random color on creation', () => {
        const path = new CodePath('Test Path', 'test-id');

        assert.ok(path.colorName);
        assert.ok(path.colorName.startsWith('charts.'));
    });

    test('Should use provided color when specified', () => {
        const path = new CodePath('Test Path', 'test-id', new Date(), 'charts.blue');

        assert.strictEqual(path.colorName, 'charts.blue');
    });
});
