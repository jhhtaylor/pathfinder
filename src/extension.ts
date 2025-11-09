import * as vscode from 'vscode';
import { PathfinderDataProvider } from './pathfinderDataProvider';
import { CodePath, PathStep } from './models/CodePath';

let treeDataProvider: PathfinderDataProvider;
let currentStepDecorationType: vscode.TextEditorDecorationType;

export function activate(context: vscode.ExtensionContext) {
    // Initialize the tree data provider
    treeDataProvider = new PathfinderDataProvider(context.workspaceState);

    // Create the tree view
    const treeView = vscode.window.createTreeView('pathfinder', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: true,
        dragAndDropController: treeDataProvider
    });

    // Create decoration type for highlighting current step
    currentStepDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
        isWholeLine: true,
        overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
        overviewRulerLane: vscode.OverviewRulerLane.Center
    });

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('pathfinder.createNewPath', createNewPath),
        vscode.commands.registerCommand('pathfinder.addToCodePath', addToCodePath),
        vscode.commands.registerCommand('pathfinder.deletePath', deletePath),
        vscode.commands.registerCommand('pathfinder.renamePath', renamePath),
        vscode.commands.registerCommand('pathfinder.navigateToStep', navigateToStep),
        vscode.commands.registerCommand('pathfinder.removeStep', removeStep),
        vscode.commands.registerCommand('pathfinder.nextStep', nextStep),
        vscode.commands.registerCommand('pathfinder.previousStep', previousStep),
        vscode.commands.registerCommand('pathfinder.playPath', playPath),
        treeView
    );
}

function getDefaultPathName(): string {
    const existingPaths = treeDataProvider.getCodePaths();
    const existingNames = new Set(existingPaths.map(p => p.label));

    let counter = 1;
    let defaultName = `Code Path ${counter}`;

    while (existingNames.has(defaultName)) {
        counter++;
        defaultName = `Code Path ${counter}`;
    }

    return defaultName;
}

async function createNewPath() {
    const name = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new code path',
        placeHolder: 'e.g., User Authentication Flow'
    });

    // If user cancels (undefined), don't create anything
    if (name === undefined) {
        return;
    }

    // If user presses enter without typing (empty string), use default name
    const finalName = name.trim() || getDefaultPathName();

    treeDataProvider.createCodePath(finalName);
    vscode.window.showInformationMessage(`Code path "${finalName}" created!`);
}

async function addToCodePath() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    const filePath = editor.document.uri.fsPath;
    const position = editor.selection.active;
    const lineNumber = position.line;
    const columnNumber = position.character;

    // Get the code snippet for the current line
    const lineText = editor.document.lineAt(lineNumber).text.trim();

    // Get all code paths
    const codePaths = treeDataProvider.getCodePaths();

    if (codePaths.length === 0) {
        // No code paths exist, create one first
        const createNew = await vscode.window.showQuickPick(['Create New Code Path'], {
            placeHolder: 'No code paths found. Create a new one?'
        });

        if (createNew) {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter a name for the new code path',
                placeHolder: 'e.g., User Authentication Flow'
            });

            // If user cancels, don't create
            if (name === undefined) {
                return;
            }

            // Use default name if empty
            const finalName = name.trim() || getDefaultPathName();
            const newPath = treeDataProvider.createCodePath(finalName);
            treeDataProvider.addStepToPath(newPath.id, filePath, lineNumber, columnNumber, lineText);
            vscode.window.showInformationMessage(`Added line ${lineNumber + 1} to "${finalName}"`);
        }
        return;
    }

    // Show quick pick to select which code path to add to
    interface PathQuickPickItem extends vscode.QuickPickItem {
        pathId: string;
    }

    const items: PathQuickPickItem[] = [
        ...codePaths.map(path => ({
            label: path.label as string,
            description: typeof path.description === 'string' ? path.description : '',
            pathId: path.id
        })),
        {
            label: '$(plus) Create New Code Path',
            description: '',
            pathId: '__new__'
        }
    ];

    const selected = await vscode.window.showQuickPick<PathQuickPickItem>(items, {
        placeHolder: `Add line ${lineNumber + 1} to which code path?`
    });

    if (selected) {
        if (selected.pathId === '__new__') {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter a name for the new code path',
                placeHolder: 'e.g., User Authentication Flow'
            });

            // If user cancels, don't create
            if (name === undefined) {
                return;
            }

            // Use default name if empty
            const finalName = name.trim() || getDefaultPathName();
            const newPath = treeDataProvider.createCodePath(finalName);
            treeDataProvider.addStepToPath(newPath.id, filePath, lineNumber, columnNumber, lineText);
            vscode.window.showInformationMessage(`Added line ${lineNumber + 1} to "${finalName}"`);
        } else {
            treeDataProvider.addStepToPath(selected.pathId, filePath, lineNumber, columnNumber, lineText);
            vscode.window.showInformationMessage(`Added line ${lineNumber + 1} to "${selected.label}"`);
        }
    }
}

async function deletePath(item: CodePath) {
    const confirm = await vscode.window.showWarningMessage(
        `Delete code path "${item.label}"?`,
        { modal: true },
        'Delete'
    );

    if (confirm === 'Delete') {
        treeDataProvider.deleteCodePath(item.id);
        vscode.window.showInformationMessage(`Code path "${item.label}" deleted`);
    }
}

async function renamePath(item: CodePath) {
    const newName = await vscode.window.showInputBox({
        prompt: 'Enter a new name for the code path',
        value: item.label as string
    });

    if (newName) {
        treeDataProvider.renameCodePath(item.id, newName);
        vscode.window.showInformationMessage(`Code path renamed to "${newName}"`);
    }
}

async function navigateToStep(item: PathStep) {
    if (!item.resourceUri || item.lineNumber === undefined) {
        return;
    }

    const document = await vscode.workspace.openTextDocument(item.resourceUri);
    const editor = await vscode.window.showTextDocument(document);

    const line = item.lineNumber;
    const column = item.columnNumber || 0;
    const position = new vscode.Position(line, column);
    const range = new vscode.Range(position, position);

    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

    // Highlight the line
    highlightLine(editor, line);
}

function highlightLine(editor: vscode.TextEditor, lineNumber: number) {
    const range = new vscode.Range(
        new vscode.Position(lineNumber, 0),
        new vscode.Position(lineNumber, Number.MAX_VALUE)
    );

    editor.setDecorations(currentStepDecorationType, [range]);

    // Clear the decoration after 2 seconds
    setTimeout(() => {
        editor.setDecorations(currentStepDecorationType, []);
    }, 2000);
}

async function removeStep(item: PathStep) {
    if (!item.pathId || item.stepNumber === undefined) {
        return;
    }

    const path = treeDataProvider.getCodePath(item.pathId);
    if (!path) {
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Remove step ${item.stepNumber} from "${path.label}"?`,
        { modal: true },
        'Remove'
    );

    if (confirm === 'Remove') {
        const isLastStep = path.steps.length === 1;
        treeDataProvider.removeStepFromPath(item.pathId, item.stepNumber);

        if (isLastStep) {
            vscode.window.showInformationMessage(`Removed last step. Code path "${path.label}" deleted.`);
        } else {
            vscode.window.showInformationMessage(`Step ${item.stepNumber} removed`);
        }
    }
}

async function nextStep() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const currentFile = editor.document.uri.fsPath;
    const currentLine = editor.selection.active.line;

    // Find current step
    const currentStep = findCurrentStep(currentFile, currentLine);
    if (!currentStep) {
        vscode.window.showInformationMessage('Not currently at a step in any code path');
        return;
    }

    const next = treeDataProvider.getNextStep(currentStep);
    if (next) {
        await navigateToStep(next);
    } else {
        vscode.window.showInformationMessage('Already at the last step');
    }
}

async function previousStep() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const currentFile = editor.document.uri.fsPath;
    const currentLine = editor.selection.active.line;

    // Find current step
    const currentStep = findCurrentStep(currentFile, currentLine);
    if (!currentStep) {
        vscode.window.showInformationMessage('Not currently at a step in any code path');
        return;
    }

    const previous = treeDataProvider.getPreviousStep(currentStep);
    if (previous) {
        await navigateToStep(previous);
    } else {
        vscode.window.showInformationMessage('Already at the first step');
    }
}

function findCurrentStep(filePath: string, lineNumber: number): PathStep | undefined {
    const codePaths = treeDataProvider.getCodePaths();
    for (const path of codePaths) {
        for (const step of path.steps) {
            if (step.resourceUri?.fsPath === filePath && step.lineNumber === lineNumber) {
                return step;
            }
        }
    }
    return undefined;
}

async function playPath(item: CodePath) {
    if (item.steps.length === 0) {
        vscode.window.showInformationMessage('This code path has no steps');
        return;
    }

    const delayMs = 1500; // 1.5 seconds between steps

    for (let i = 0; i < item.steps.length; i++) {
        const step = item.steps[i];
        await navigateToStep(step);

        if (i < item.steps.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    vscode.window.showInformationMessage(`Finished playing code path "${item.label}"`);
}

export function deactivate() {
    if (currentStepDecorationType) {
        currentStepDecorationType.dispose();
    }
}
