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
});
