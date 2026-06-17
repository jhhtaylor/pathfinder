import * as assert from 'assert';
import * as vscode from 'vscode';
import { PathfinderDataProvider } from '../pathfinderDataProvider';
import { CodePath, PathStep } from '../models/CodePath';

class MockMemento implements vscode.Memento {
    private store: Record<string, any>;

    constructor(initial: Record<string, any> = {}) {
        this.store = initial;
    }

    keys(): readonly string[] {
        return Object.keys(this.store);
    }

    get<T>(key: string, defaultValue?: T): T {
        if (key in this.store) {
            return this.store[key] as T;
        }
        return defaultValue as T;
    }

    update(key: string, value: any): Thenable<void> {
        this.store[key] = value;
        return Promise.resolve();
    }
}

suite('PathfinderDataProvider Test Suite', () => {
    let provider: PathfinderDataProvider;
    let memento: MockMemento;

    setup(() => {
        memento = new MockMemento();
        provider = new PathfinderDataProvider(memento);
    });

    test('Should create a new code path', () => {
        const path = provider.createCodePath('Test Path');
        assert.strictEqual(path.label, 'Test Path');
        assert.strictEqual(provider.getCodePaths().length, 1);
    });

    test('Should add step to code path', () => {
        const path = provider.createCodePath('Test Path');
        provider.addStepToPath(path.id, '/test/file.ts', 10, 5, 'console.log("test")');

        const codePath = provider.getCodePath(path.id);
        assert.strictEqual(codePath?.steps.length, 1);
        assert.strictEqual(codePath?.steps[0].lineNumber, 10);
    });

    test('Should remove step from code path', () => {
        const path = provider.createCodePath('Test Path');
        provider.addStepToPath(path.id, '/test/file.ts', 10, 5);
        provider.addStepToPath(path.id, '/test/file.ts', 20, 5);

        assert.strictEqual(provider.getCodePath(path.id)?.steps.length, 2);

        provider.removeStepFromPath(path.id, 1);
        assert.strictEqual(provider.getCodePath(path.id)?.steps.length, 1);
        assert.strictEqual(provider.getCodePath(path.id)?.steps[0].lineNumber, 20);
    });

    test('Should delete code path when last step is removed', () => {
        const path = provider.createCodePath('Test Path');
        provider.addStepToPath(path.id, '/test/file.ts', 10, 5);

        provider.removeStepFromPath(path.id, 1);
        assert.strictEqual(provider.getCodePaths().length, 0);
    });

    test('Should delete code path by id', () => {
        const path1 = provider.createCodePath('Path 1');
        const path2 = provider.createCodePath('Path 2');

        assert.strictEqual(provider.getCodePaths().length, 2);

        provider.deleteCodePath(path1.id);
        assert.strictEqual(provider.getCodePaths().length, 1);
        assert.strictEqual(provider.getCodePath(path2.id)?.label, 'Path 2');
    });

    test('Should rename code path', () => {
        const path = provider.createCodePath('Old Name');
        provider.renameCodePath(path.id, 'New Name');

        assert.strictEqual(provider.getCodePath(path.id)?.label, 'New Name');
    });

    test('Should get next step', () => {
        const path = provider.createCodePath('Test Path');
        provider.addStepToPath(path.id, '/test/file.ts', 10, 5);
        provider.addStepToPath(path.id, '/test/file.ts', 20, 5);
        provider.addStepToPath(path.id, '/test/file.ts', 30, 5);

        const codePath = provider.getCodePath(path.id);
        const firstStep = codePath!.steps[0];
        const nextStep = provider.getNextStep(firstStep);

        assert.strictEqual(nextStep?.lineNumber, 20);
    });

    test('Should get previous step', () => {
        const path = provider.createCodePath('Test Path');
        provider.addStepToPath(path.id, '/test/file.ts', 10, 5);
        provider.addStepToPath(path.id, '/test/file.ts', 20, 5);

        const codePath = provider.getCodePath(path.id);
        const secondStep = codePath!.steps[1];
        const prevStep = provider.getPreviousStep(secondStep);

        assert.strictEqual(prevStep?.lineNumber, 10);
    });

    test('Should return undefined for next step on last step', () => {
        const path = provider.createCodePath('Test Path');
        provider.addStepToPath(path.id, '/test/file.ts', 10, 5);

        const codePath = provider.getCodePath(path.id);
        const lastStep = codePath!.steps[0];
        const nextStep = provider.getNextStep(lastStep);

        assert.strictEqual(nextStep, undefined);
    });

    test('Should return undefined for previous step on first step', () => {
        const path = provider.createCodePath('Test Path');
        provider.addStepToPath(path.id, '/test/file.ts', 10, 5);

        const codePath = provider.getCodePath(path.id);
        const firstStep = codePath!.steps[0];
        const prevStep = provider.getPreviousStep(firstStep);

        assert.strictEqual(prevStep, undefined);
    });

    test('Should get parent for PathStep', () => {
        const path = provider.createCodePath('Test Path');
        provider.addStepToPath(path.id, '/test/file.ts', 10, 5);

        const codePath = provider.getCodePath(path.id);
        const step = codePath!.steps[0];
        const parent = provider.getParent(step);

        assert.strictEqual(parent?.id, path.id);
    });

    test('Should return undefined as parent for CodePath', () => {
        const path = provider.createCodePath('Test Path');
        const parent = provider.getParent(path);

        assert.strictEqual(parent, undefined);
    });

    test('Should migrate old 0-based line numbers to 1-based on load', () => {
        const oldData = [{
            label: 'Old Path',
            id: 'old-path-1',
            creationTime: new Date().toISOString(),
            colorName: 'charts.blue',
            steps: [
                { filePath: '/test/file.ts', lineNumber: 0, columnNumber: 0, stepNumber: 1 },
                { filePath: '/test/file.ts', lineNumber: 9, columnNumber: 5, stepNumber: 2 }
            ]
        }];
        const oldMemento = new MockMemento({ 'pathfinder.codePaths': oldData });
        const migratedProvider = new PathfinderDataProvider(oldMemento);

        const paths = migratedProvider.getCodePaths();
        assert.strictEqual(paths.length, 1);
        assert.strictEqual(paths[0].steps[0].lineNumber, 1);
        assert.strictEqual(paths[0].steps[1].lineNumber, 10);
    });

    test('Should not double-migrate already 1-based line numbers', () => {
        const newData = [{
            label: 'New Path',
            id: 'new-path-1',
            creationTime: new Date().toISOString(),
            colorName: 'charts.green',
            steps: [
                { filePath: '/test/file.ts', lineNumber: 1, columnNumber: 0, stepNumber: 1 },
                { filePath: '/test/file.ts', lineNumber: 56, columnNumber: 0, stepNumber: 2 }
            ]
        }];
        const newMemento = new MockMemento({
            'pathfinder.codePaths': newData,
            'pathfinder.lineNumbers1Based': true
        });
        const newProvider = new PathfinderDataProvider(newMemento);

        const paths = newProvider.getCodePaths();
        assert.strictEqual(paths.length, 1);
        assert.strictEqual(paths[0].steps[0].lineNumber, 1);
        assert.strictEqual(paths[0].steps[1].lineNumber, 56);
    });
});
