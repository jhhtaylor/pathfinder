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
        assert.ok((step.description as string).includes('Line 10'));
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

suite('CodePath.stepDisplayLabel Test Suite', () => {
    test('Returns "Step N: filename" with no custom label', () => {
        const label = CodePath.stepDisplayLabel(1, '/src/extension.ts');
        assert.strictEqual(label, 'Step 1: extension.ts');
    });

    test('Appends custom label after em dash', () => {
        const label = CodePath.stepDisplayLabel(1, '/src/extension.ts', 'validate input');
        assert.strictEqual(label, 'Step 1: extension.ts — validate input');
    });

    test('Uses step number correctly in base', () => {
        const label = CodePath.stepDisplayLabel(3, '/src/utils.ts', 'helper');
        assert.strictEqual(label, 'Step 3: utils.ts — helper');
    });

    test('Returns plain base when custom label is empty string', () => {
        const label = CodePath.stepDisplayLabel(2, '/src/index.ts', '');
        assert.strictEqual(label, 'Step 2: index.ts');
    });

    test('Returns plain base when custom label is undefined', () => {
        const label = CodePath.stepDisplayLabel(2, '/src/index.ts', undefined);
        assert.strictEqual(label, 'Step 2: index.ts');
    });

    test('Handles windows-style path correctly', () => {
        const label = CodePath.stepDisplayLabel(1, 'C:\\src\\handler.ts');
        assert.ok((label as string).endsWith('handler.ts'));
    });
});

suite('PathStep customLabel Test Suite', () => {
    test('Step has no customLabel by default', () => {
        const codePath = new CodePath('My Path', 'path-1');
        codePath.addStep('/src/file.ts', 10);

        assert.strictEqual(codePath.steps[0].customLabel, undefined);
    });

    test('Step label is "Step N: filename" when no customLabel', () => {
        const codePath = new CodePath('My Path', 'path-1');
        codePath.addStep('/src/extension.ts', 0);

        assert.strictEqual(codePath.steps[0].label, 'Step 1: extension.ts');
    });

    test('addStep stores and shows customLabel', () => {
        const codePath = new CodePath('My Path', 'path-1');
        codePath.addStep('/src/extension.ts', 0, 0, undefined, 'validate input');

        assert.strictEqual(codePath.steps[0].customLabel, 'validate input');
        assert.strictEqual(codePath.steps[0].label, 'Step 1: extension.ts — validate input');
    });

    test('customLabel is preserved after renumbering via removeStep', () => {
        const codePath = new CodePath('My Path', 'path-1');
        codePath.addStep('/src/a.ts', 0, 0, undefined, 'first');
        codePath.addStep('/src/b.ts', 0, 0, undefined, 'second');
        codePath.addStep('/src/c.ts', 0, 0, undefined, 'third');

        codePath.removeStep(2); // remove "second"

        // "third" is now step 2
        assert.strictEqual(codePath.steps[1].customLabel, 'third');
        assert.strictEqual(codePath.steps[1].label, 'Step 2: c.ts — third');
    });

    test('step without customLabel keeps plain label after renumbering', () => {
        const codePath = new CodePath('My Path', 'path-1');
        codePath.addStep('/src/a.ts', 0);
        codePath.addStep('/src/b.ts', 0);
        codePath.addStep('/src/c.ts', 0);

        codePath.removeStep(1); // remove step 1

        // b.ts becomes step 1
        assert.strictEqual(codePath.steps[0].customLabel, undefined);
        assert.strictEqual(codePath.steps[0].label, 'Step 1: b.ts');
    });

    test('mixed custom and plain labels both survive renumbering', () => {
        const codePath = new CodePath('My Path', 'path-1');
        codePath.addStep('/src/a.ts', 0);                          // no label
        codePath.addStep('/src/b.ts', 0, 0, undefined, 'convert'); // custom
        codePath.addStep('/src/c.ts', 0);                          // no label

        codePath.removeStep(1); // remove a.ts

        assert.strictEqual(codePath.steps[0].label, 'Step 1: b.ts — convert');
        assert.strictEqual(codePath.steps[1].label, 'Step 2: c.ts');
    });
});
