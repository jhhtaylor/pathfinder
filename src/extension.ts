import * as vscode from 'vscode';
import { PathfinderDataProvider } from './pathfinderDataProvider';
import { CodePath, PathStep } from './models/CodePath';
import { CallHierarchyProvider, isInWorkspace } from './callHierarchyProvider';
import { CallNode, CallDepth } from './models/CallNode';

let treeDataProvider: PathfinderDataProvider;
let currentStepDecorationType: vscode.TextEditorDecorationType;
let collapsedPaths: Set<string>;
let callHierarchyProvider: CallHierarchyProvider;
let callHierarchyView: vscode.TreeView<CallNode>;

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

    // ── Call Hierarchy view ──────────────────────────────────────────────────
    callHierarchyProvider = new CallHierarchyProvider();

    callHierarchyView = vscode.window.createTreeView('pathfinderCallHierarchy', {
        treeDataProvider: callHierarchyProvider,
        showCollapseAll: true
    });

    const updateCallDepthContext = (depth: CallDepth) => {
        const label = depth === 3 ? '3 Levels' : 'All Levels';
        callHierarchyView.description = label;
        vscode.commands.executeCommand('setContext', 'pathfinder:callDepth', depth === 100 ? 'all' : String(depth));
    };
    updateCallDepthContext(3);

    // Propagate language-server capability messages into the view title area.
    context.subscriptions.push(
        callHierarchyProvider.onDidChangeMessage.event(msg => {
            callHierarchyView.message = msg;
        })
    );

    // When the user returns to the base file, reveal the node at the cursor position.
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (!editor) { return; }
            const baseUri = callHierarchyProvider.getBaseUri();
            if (!baseUri || editor.document.uri.toString() !== baseUri.toString()) { return; }
            // Wait for the debounced tree rebuild (400 ms) to finish before revealing.
            await new Promise(resolve => setTimeout(resolve, 500));
            const node = callHierarchyProvider.getNodeAtPosition(editor.selection.active);
            if (!node) { return; }
            try {
                await callHierarchyView.reveal(node, { select: true, focus: false, expand: false });
            } catch { /* tree may have been rebuilt again */ }
        })
    );

    context.subscriptions.push(
        callHierarchyView,
        callHierarchyProvider,
        vscode.commands.registerCommand('pathfinder.callHierarchy.setDepth3', () => {
            callHierarchyProvider.setDepth(3);
            updateCallDepthContext(3);
        }),
        vscode.commands.registerCommand('pathfinder.callHierarchy.setDepthAll', () => {
            callHierarchyProvider.setDepth(100);
            updateCallDepthContext(100);
        }),
        vscode.commands.registerCommand('pathfinder.callHierarchy.refresh', () => {
            callHierarchyProvider.refresh();
        }),
        vscode.commands.registerCommand('pathfinder.callHierarchy.navigateToNode',
            async (node: CallNode) => {
                // Suppress the active-editor change that navigation will trigger
                // so the call hierarchy tree stays in its current expanded state.
                callHierarchyProvider.suppressNextRefresh();

                // For non-root nodes, navigate to the root ancestor first so that
                // pressing "back" always returns to the parent method in the base file,
                // not wherever the cursor happened to be.
                if (!node.isRoot) {
                    let root: CallNode = node;
                    while (root.parent) { root = root.parent; }
                    await navigateToCallNode(root.callItem);
                }

                await navigateToCallNode(node.callItem);
                // Re-select the node in the panel so the user can see where they came from.
                try {
                    await callHierarchyView.reveal(node, { select: true, focus: false, expand: false });
                } catch { /* node may be out of tree if a manual refresh happened */ }
            }
        ),
        vscode.commands.registerCommand('pathfinder.callHierarchy.goToDefinition',
            (node: CallNode) => navigateToCallNode(node.callItem)
        ),
        vscode.commands.registerCommand('pathfinder.callHierarchy.addToCodePath',
            (node: CallNode) => addCallNodeToCodePath(node)
        )
    );
    // Debug dump — diagnostic only, listed last in command palette
    const debugChannel = vscode.window.createOutputChannel('Pathfinder Debug');
    context.subscriptions.push(debugChannel);
    context.subscriptions.push(
        vscode.commands.registerCommand('pathfinder.callHierarchy.debugDump', async () => {
                debugChannel.clear();
                debugChannel.show(true); // show but don't steal focus

                const editor = vscode.window.activeTextEditor;
                debugChannel.appendLine('=== Pathfinder Call Hierarchy Debug Dump ===');
                debugChannel.appendLine(`Depth: ${callHierarchyProvider.getDepth()}`);
                debugChannel.appendLine('');

                const folders = vscode.workspace.workspaceFolders;
                debugChannel.appendLine('Workspace folders:');
                if (!folders || folders.length === 0) {
                    debugChannel.appendLine('  (none — external filtering disabled)');
                } else {
                    for (const f of folders) {
                        debugChannel.appendLine(`  ${f.uri.fsPath}`);
                    }
                }
                debugChannel.appendLine('');

                if (!editor) {
                    debugChannel.appendLine('No active editor.');
                    return;
                }

                debugChannel.appendLine(`Active file: ${editor.document.uri.fsPath}`);
                debugChannel.appendLine('');

                let symbols: vscode.DocumentSymbol[] | undefined;
                try {
                    symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                        'vscode.executeDocumentSymbolProvider',
                        editor.document.uri
                    );
                } catch (e) {
                    debugChannel.appendLine(`Error fetching symbols: ${e}`);
                    return;
                }

                if (!symbols || symbols.length === 0) {
                    debugChannel.appendLine('No document symbols returned (is a language server active?)');
                    return;
                }

                const excludeExternal = vscode.workspace.getConfiguration('pathfinder')
                    .get<boolean>('callHierarchy.excludeExternalPackages', true);
                debugChannel.appendLine(`excludeExternalPackages: ${excludeExternal}`);
                debugChannel.appendLine('');

                const methods = debugExtractMethods(symbols);
                methods.sort((a, b) => a.range.start.line - b.range.start.line);
                debugChannel.appendLine(`Methods found: ${methods.length}`);
                debugChannel.appendLine('');

                for (const symbol of methods) {
                    debugChannel.appendLine(`▶ ${symbol.name}  (line ${symbol.range.start.line + 1})`);
                    try {
                        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                            'vscode.prepareCallHierarchy',
                            editor.document.uri,
                            symbol.selectionRange.start
                        );
                        if (!items || items.length === 0) {
                            debugChannel.appendLine('    (prepareCallHierarchy returned nothing)');
                            continue;
                        }

                        const outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
                            'vscode.provideOutgoingCalls',
                            items[0]
                        );
                        if (!outgoing || outgoing.length === 0) {
                            debugChannel.appendLine('    (no outgoing calls)');
                        } else {
                            for (const call of outgoing) {
                                const inWs = isInWorkspace(call.to.uri);
                                const shown = !excludeExternal || inWs;
                                const tag = shown ? '✓ shown   ' : '✗ filtered';
                                const rel = vscode.workspace.asRelativePath(call.to.uri);
                                debugChannel.appendLine(`    [${tag}] ${call.to.name}  →  ${rel}:${call.to.selectionRange.start.line + 1}`);
                            }
                        }
                    } catch (e) {
                        debugChannel.appendLine(`    (error: ${e})`);
                    }
                    debugChannel.appendLine('');
                }
            })
    );
    // ────────────────────────────────────────────────────────────────────────

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('pathfinder.createNewPath', createNewPath),
        vscode.commands.registerCommand('pathfinder.addToCodePath', addToCodePath),
        vscode.commands.registerCommand('pathfinder.deletePath', deletePath),
        vscode.commands.registerCommand('pathfinder.renamePath', renamePath),
        vscode.commands.registerCommand('pathfinder.navigateToStep', navigateToStep),
        vscode.commands.registerCommand('pathfinder.removeStep', removeStep),
        vscode.commands.registerCommand('pathfinder.renameStep', renameStep),
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

async function renameStep(item: PathStep) {
    if (!item.pathId || item.stepNumber === undefined) {
        return;
    }

    const currentNote = item.customLabel ?? '';

    const newNote = await vscode.window.showInputBox({
        prompt: 'Add a note to this step — appended after the filename (leave empty to clear)',
        value: currentNote,
        valueSelection: [0, currentNote.length]
    });

    if (newNote === undefined) {
        return; // cancelled
    }

    treeDataProvider.renameStep(item.pathId, item.stepNumber, newNote.trim() || undefined);
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

async function navigateToCallNode(item: vscode.CallHierarchyItem) {
    const document = await vscode.workspace.openTextDocument(item.uri);
    const position = item.selectionRange.start;
    const selection = new vscode.Selection(position, position);
    // Pass selection to showTextDocument so the open + cursor move are a single
    // navigation history entry — without this, pressing back lands at the top
    // of the file instead of going directly back to the previous file.
    const editor = await vscode.window.showTextDocument(document, { selection });
    editor.revealRange(item.selectionRange, vscode.TextEditorRevealType.InCenter);
    highlightLine(editor, position.line);
}

async function addCallNodeToCodePath(node: CallNode) {
    const item = node.callItem;
    const filePath = item.uri.fsPath;
    const lineNumber = item.selectionRange.start.line;
    const columnNumber = item.selectionRange.start.character;
    const lineText = item.name;

    const codePaths = treeDataProvider.getCodePaths();

    if (codePaths.length === 0) {
        const createNew = await vscode.window.showQuickPick(['Create New Code Path'], {
            placeHolder: 'No code paths found. Create a new one?'
        });
        if (!createNew) { return; }

        const finalName = await resolveCodePathName();
        if (finalName === undefined) { return; }

        const newPath = treeDataProvider.createCodePath(finalName);
        treeDataProvider.addStepToPath(newPath.id, filePath, lineNumber, columnNumber, lineText);
        vscode.window.showInformationMessage(`Added "${item.name}" to "${finalName}"`);
        return;
    }

    interface PathItem extends vscode.QuickPickItem { pathId: string; }
    const items: PathItem[] = [
        ...codePaths.map(p => ({ label: p.label as string, description: '', pathId: p.id })),
        { label: '$(plus) Create New Code Path', description: '', pathId: '__new__' }
    ];

    const selected = await vscode.window.showQuickPick<PathItem>(items, {
        placeHolder: `Add "${item.name}" to which code path?`
    });
    if (!selected) { return; }

    if (selected.pathId === '__new__') {
        const finalName = await resolveCodePathName();
        if (finalName === undefined) { return; }
        const newPath = treeDataProvider.createCodePath(finalName);
        treeDataProvider.addStepToPath(newPath.id, filePath, lineNumber, columnNumber, lineText);
        vscode.window.showInformationMessage(`Added "${item.name}" to "${finalName}"`);
    } else {
        treeDataProvider.addStepToPath(selected.pathId, filePath, lineNumber, columnNumber, lineText);
        vscode.window.showInformationMessage(`Added "${item.name}" to "${selected.label}"`);
    }
}

function debugExtractMethods(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
    const result: vscode.DocumentSymbol[] = [];
    for (const s of symbols) {
        if (s.kind === vscode.SymbolKind.Function || s.kind === vscode.SymbolKind.Method || s.kind === vscode.SymbolKind.Constructor) {
            result.push(s);
        }
        if (s.children?.length) { result.push(...debugExtractMethods(s.children)); }
    }
    return result;
}

async function resolveCodePathName(): Promise<string | undefined> {
    const promptForName = vscode.workspace.getConfiguration('pathfinder').get<boolean>('promptForName', false);
    if (!promptForName) {
        return getDefaultPathName();
    }
    const name = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new code path',
        placeHolder: 'e.g., User Authentication Flow'
    });
    if (name === undefined) { return undefined; }
    return name.trim() || getDefaultPathName();
}

export function deactivate() {
    if (currentStepDecorationType) {
        currentStepDecorationType.dispose();
    }
}
