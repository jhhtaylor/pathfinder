import * as vscode from 'vscode';
import { PathfinderDataProvider } from './pathfinderDataProvider';
import { CodePath, PathStep } from './models/CodePath';

let treeDataProvider: PathfinderDataProvider;
let currentStepDecorationType: vscode.TextEditorDecorationType;
let collapsedPaths: Set<string>;

// Play state management
let isPlaying = false;
let isPaused = false;
let shouldStopPlaying = false;
let pauseResolve: (() => void) | null = null;

export function activate(context: vscode.ExtensionContext) {
    // Initialize the tree data provider
    treeDataProvider = new PathfinderDataProvider(context.workspaceState);
    collapsedPaths = new Set<string>();

    const updateCollapsedContext = () => {
        const allPaths = treeDataProvider.getCodePaths();
        const allCollapsed = allPaths.length > 0 && collapsedPaths.size === allPaths.length;
        vscode.commands.executeCommand('setContext', 'pathfinder:allCollapsed', allCollapsed);
    };

    // Create the tree view
    const treeView = vscode.window.createTreeView('pathfinder', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: false,
        dragAndDropController: treeDataProvider
    });

    // Track manual expand/collapse to update the icon
    context.subscriptions.push(
        treeView.onDidExpandElement((e) => {
            if (e.element instanceof CodePath) {
                collapsedPaths.delete(e.element.id);
                updateCollapsedContext();
            }
        })
    );

    context.subscriptions.push(
        treeView.onDidCollapseElement((e) => {
            if (e.element instanceof CodePath) {
                collapsedPaths.add(e.element.id);
                updateCollapsedContext();
            }
        })
    );

    // Create decoration type for highlighting current step
    currentStepDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
        isWholeLine: true,
        overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
        overviewRulerLane: vscode.OverviewRulerLane.Center
    });

    // Initialize context for play controls
    vscode.commands.executeCommand('setContext', 'pathfinder:isPlaying', false);
    vscode.commands.executeCommand('setContext', 'pathfinder:isPaused', false);
    updateCollapsedContext();

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
        vscode.commands.registerCommand('pathfinder.pausePlayPath', pausePlayPath),
        vscode.commands.registerCommand('pathfinder.resumePlayPath', resumePlayPath),
        vscode.commands.registerCommand('pathfinder.stopPlayPath', stopPlayPath),
        vscode.commands.registerCommand('pathfinder.exportCodePaths', () => exportCodePaths()),
        vscode.commands.registerCommand('pathfinder.importCodePaths', () => importCodePaths()),
        vscode.commands.registerCommand('pathfinder.collapseAll', () => collapseAll(treeView, updateCollapsedContext)),
        vscode.commands.registerCommand('pathfinder.expandAll', () => expandAll(treeView, updateCollapsedContext)),
        vscode.commands.registerCommand('pathfinder.showMoreOptions', showMoreOptions),
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
    const promptForName = vscode.workspace.getConfiguration('pathfinder').get<boolean>('promptForName', false);

    let finalName: string;

    if (promptForName) {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter a name for the new code path',
            placeHolder: 'e.g., User Authentication Flow'
        });

        // If user cancels (undefined), don't create anything
        if (name === undefined) {
            return;
        }

        // If user presses enter without typing (empty string), use default name
        finalName = name.trim() || getDefaultPathName();
    } else {
        // Automatically use default name
        finalName = getDefaultPathName();
    }

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
            const promptForName = vscode.workspace.getConfiguration('pathfinder').get<boolean>('promptForName', false);
            let finalName: string;

            if (promptForName) {
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter a name for the new code path',
                    placeHolder: 'e.g., User Authentication Flow'
                });

                // If user cancels, don't create
                if (name === undefined) {
                    return;
                }

                // Use default name if empty
                finalName = name.trim() || getDefaultPathName();
            } else {
                finalName = getDefaultPathName();
            }

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
            const promptForName = vscode.workspace.getConfiguration('pathfinder').get<boolean>('promptForName', false);
            let finalName: string;

            if (promptForName) {
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter a name for the new code path',
                    placeHolder: 'e.g., User Authentication Flow'
                });

                // If user cancels, don't create
                if (name === undefined) {
                    return;
                }

                // Use default name if empty
                finalName = name.trim() || getDefaultPathName();
            } else {
                finalName = getDefaultPathName();
            }

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

    if (isPlaying) {
        vscode.window.showWarningMessage('Already playing a code path');
        return;
    }

    isPlaying = true;
    isPaused = false;
    shouldStopPlaying = false;
    vscode.commands.executeCommand('setContext', 'pathfinder:isPlaying', true);
    vscode.commands.executeCommand('setContext', 'pathfinder:isPaused', false);

    const delaySeconds = vscode.workspace.getConfiguration('pathfinder').get<number>('playDelaySeconds', 1.5);
    const delayMs = delaySeconds * 1000;

    try {
        for (let i = 0; i < item.steps.length; i++) {
            if (shouldStopPlaying) {
                vscode.window.showInformationMessage('Playback stopped');
                break;
            }

            const step = item.steps[i];
            await navigateToStep(step);

            if (i < item.steps.length - 1) {
                // Wait for delay, but check for pause/stop
                const startTime = Date.now();
                while (Date.now() - startTime < delayMs) {
                    if (shouldStopPlaying) {
                        break;
                    }

                    if (isPaused) {
                        // Wait for resume
                        await new Promise<void>(resolve => {
                            pauseResolve = resolve;
                        });
                        pauseResolve = null;

                        // Replay the current step after resuming for smoother UX
                        await navigateToStep(step);
                    }

                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }

        if (!shouldStopPlaying) {
            vscode.window.showInformationMessage(`Finished playing code path "${item.label}"`);
        }
    } finally {
        isPlaying = false;
        isPaused = false;
        shouldStopPlaying = false;
        pauseResolve = null;
        vscode.commands.executeCommand('setContext', 'pathfinder:isPlaying', false);
        vscode.commands.executeCommand('setContext', 'pathfinder:isPaused', false);
    }
}

function pausePlayPath() {
    if (!isPlaying || isPaused) {
        return;
    }
    isPaused = true;
    vscode.commands.executeCommand('setContext', 'pathfinder:isPaused', true);
    vscode.window.showInformationMessage('Playback paused');
}

function resumePlayPath() {
    if (!isPlaying || !isPaused) {
        return;
    }
    isPaused = false;
    vscode.commands.executeCommand('setContext', 'pathfinder:isPaused', false);
    if (pauseResolve) {
        pauseResolve();
    }
    vscode.window.showInformationMessage('Playback resumed');
}

function stopPlayPath() {
    if (!isPlaying) {
        return;
    }
    shouldStopPlaying = true;
    if (isPaused && pauseResolve) {
        pauseResolve();
    }
}

async function exportCodePaths() {
    await treeDataProvider.exportCodePathsToFile();
}

async function importCodePaths() {
    await treeDataProvider.importCodePathsFromFile();
}

async function collapseAll(treeView: vscode.TreeView<CodePath | PathStep>, updateCollapsedContext: () => void) {
    const codePaths = treeDataProvider.getCodePaths();
    const firstPath = codePaths[0];
    if (!firstPath) {
        return;
    }

    await treeView.reveal(firstPath, {
        select: false,
        focus: true,
        expand: false,
    });
    vscode.commands.executeCommand('list.collapseAll');
    collapsedPaths.clear();
    codePaths.forEach(path => collapsedPaths.add(path.id));
    updateCollapsedContext();
}

async function expandAll(treeView: vscode.TreeView<CodePath | PathStep>, updateCollapsedContext: () => void) {
    const codePaths = treeDataProvider.getCodePaths();
    if (codePaths.length === 0) {
        return;
    }
    let first = true;
    for (const path of codePaths) {
        await treeView.reveal(path, {
            select: false,
            focus: first,
            expand: true,
        });
        first = false;
        collapsedPaths.delete(path.id);
    }
    updateCollapsedContext();
}

async function showMoreOptions() {
    const picked = await vscode.window.showQuickPick(
        [
            'Export Code Paths',
            'Import Code Paths',
            'Settings',
            'Feedback',
            'Support'
        ],
        { placeHolder: 'Select an option' }
    );

    switch (picked) {
        case 'Export Code Paths':
            await exportCodePaths();
            break;
        case 'Import Code Paths':
            await importCodePaths();
            break;
        case 'Settings':
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                '@ext:jhhtaylor.pathfinder-code-paths'
            );
            break;
        case 'Feedback':
            await vscode.env.openExternal(
                vscode.Uri.parse('https://github.com/jhhtaylor/pathfinder/issues')
            );
            break;
        case 'Support':
            await vscode.env.openExternal(
                vscode.Uri.parse('https://www.buymeacoffee.com/jhhtaylor')
            );
            break;
    }
}

export function deactivate() {
    if (currentStepDecorationType) {
        currentStepDecorationType.dispose();
    }
}
