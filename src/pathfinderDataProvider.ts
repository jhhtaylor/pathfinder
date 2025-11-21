import * as vscode from 'vscode';
import * as path from 'path';
import { CodePath, PathStep } from './models/CodePath';

export class PathfinderDataProvider implements vscode.TreeDataProvider<CodePath | PathStep>, vscode.TreeDragAndDropController<CodePath | PathStep> {
    private _onDidChangeTreeData: vscode.EventEmitter<CodePath | PathStep | undefined | null | void> = new vscode.EventEmitter<CodePath | PathStep | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CodePath | PathStep | undefined | null | void> = this._onDidChangeTreeData.event;

    private codePaths: CodePath[] = [];
    private workspaceState: vscode.Memento;

    // Drag and drop support
    dropMimeTypes = ['application/vnd.code.tree.pathfinder'];
    dragMimeTypes = ['application/vnd.code.tree.pathfinder'];

    constructor(workspaceState: vscode.Memento) {
        this.workspaceState = workspaceState;
        this.loadCodePaths();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CodePath | PathStep): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CodePath | PathStep): Thenable<(CodePath | PathStep)[]> {
        if (!element) {
            // Root level - return all code paths
            return Promise.resolve(this.codePaths);
        } else if (element instanceof CodePath) {
            // Return steps for this code path
            return Promise.resolve(element.steps);
        } else {
            // PathStep has no children
            return Promise.resolve([]);
        }
    }

    getParent(element: CodePath | PathStep): CodePath | undefined {
        if (element instanceof PathStep) {
            // Find the parent CodePath for this step
            return this.codePaths.find(path => path.id === element.pathId);
        }
        // CodePath elements have no parent (they're at root level)
        return undefined;
    }

    getCodePaths(): CodePath[] {
        return this.codePaths;
    }

    getCodePath(id: string): CodePath | undefined {
        return this.codePaths.find(path => path.id === id);
    }

    createCodePath(name: string): CodePath {
        const id = `path-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newPath = new CodePath(name, id);
        this.codePaths.push(newPath);
        this.saveCodePaths();
        this.refresh();
        return newPath;
    }

    deleteCodePath(pathId: string) {
        const index = this.codePaths.findIndex(p => p.id === pathId);
        if (index !== -1) {
            this.codePaths.splice(index, 1);
            this.saveCodePaths();
            this.refresh();
        }
    }

    renameCodePath(pathId: string, newName: string) {
        const codePath = this.getCodePath(pathId);
        if (codePath) {
            codePath.label = newName;
            this.saveCodePaths();
            this.refresh();
        }
    }

    addStepToPath(
        pathId: string,
        filePath: string,
        lineNumber: number,
        columnNumber: number = 0,
        codeSnippet?: string
    ) {
        const codePath = this.getCodePath(pathId);
        if (codePath) {
            codePath.addStep(filePath, lineNumber, columnNumber, codeSnippet);
            this.saveCodePaths();
            this.refresh();
        }
    }

    removeStepFromPath(pathId: string, stepNumber: number) {
        const codePath = this.getCodePath(pathId);
        if (codePath) {
            codePath.removeStep(stepNumber);

            // If no steps left, delete the entire code path
            if (codePath.steps.length === 0) {
                this.deleteCodePath(pathId);
            } else {
                this.saveCodePaths();
                this.refresh();
            }
        }
    }

    private saveCodePaths() {
        const serialized = this.codePaths.map(path => ({
            label: path.label,
            id: path.id,
            creationTime: path.creationTime.toISOString(),
            colorName: path.colorName,
            steps: path.steps.map(step => ({
                filePath: step.resourceUri?.fsPath,
                lineNumber: step.lineNumber,
                columnNumber: step.columnNumber,
                codeSnippet: step.codeSnippet,
                stepNumber: step.stepNumber
            }))
        }));

        this.workspaceState.update('pathfinder.codePaths', serialized);
    }

    private loadCodePaths() {
        const saved = this.workspaceState.get<any[]>('pathfinder.codePaths', []);
        this.codePaths = saved.map(data => {
            const path = new CodePath(
                data.label,
                data.id,
                new Date(data.creationTime),
                data.colorName
            );

            if (data.steps) {
                data.steps.forEach((stepData: any) => {
                    if (stepData.filePath) {
                        path.addStep(
                            stepData.filePath,
                            stepData.lineNumber,
                            stepData.columnNumber || 0,
                            stepData.codeSnippet
                        );
                    }
                });
            }

            return path;
        });
    }

    getPathForStep(step: PathStep): CodePath | undefined {
        return this.codePaths.find(path => path.id === step.pathId);
    }

    getStepIndex(path: CodePath, step: PathStep): number {
        return path.steps.findIndex(s => s.id === step.id);
    }

    getNextStep(currentStep: PathStep): PathStep | undefined {
        const path = this.getPathForStep(currentStep);
        if (!path) {
            return undefined;
        }

        const currentIndex = this.getStepIndex(path, currentStep);
        if (currentIndex === -1 || currentIndex === path.steps.length - 1) {
            return undefined;
        }

        return path.steps[currentIndex + 1];
    }

    getPreviousStep(currentStep: PathStep): PathStep | undefined {
        const path = this.getPathForStep(currentStep);
        if (!path) {
            return undefined;
        }

        const currentIndex = this.getStepIndex(path, currentStep);
        if (currentIndex <= 0) {
            return undefined;
        }

        return path.steps[currentIndex - 1];
    }

    private getImportExportDirectory(): string {
        const configuredPath = vscode.workspace
            .getConfiguration('pathfinder')
            .get<string>('importExportDirectory', '')
            .trim();

        if (configuredPath === '') {
            // No configuration - use workspace root or home directory
            return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
                require('os').homedir();
        }

        // Check if path is absolute
        if (path.isAbsolute(configuredPath)) {
            return configuredPath;
        }

        // Relative path - resolve relative to workspace root
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            return path.resolve(workspaceRoot, configuredPath);
        }

        // No workspace - treat as absolute from home directory
        return path.resolve(require('os').homedir(), configuredPath);
    }

    async exportCodePathsToFile(): Promise<void> {
        const defaultPath = this.getImportExportDirectory();

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(
                path.join(defaultPath, 'pathfinder-export.json')
            ),
            filters: { jsonFiles: ['json'] },
            saveLabel: 'Export Code Paths',
        });

        if (!uri) {
            return;
        }

        const serialized = this.codePaths.map(path => ({
            label: path.label,
            id: path.id,
            creationTime: path.creationTime.toISOString(),
            colorName: path.colorName,
            steps: path.steps.map(step => ({
                filePath: step.resourceUri?.fsPath,
                lineNumber: step.lineNumber,
                columnNumber: step.columnNumber,
                codeSnippet: step.codeSnippet,
                stepNumber: step.stepNumber
            }))
        }));

        const content = JSON.stringify(serialized, null, 2);

        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        vscode.window.showInformationMessage('Code Paths exported successfully.');
    }

    async importCodePathsFromFile(): Promise<void> {
        const defaultPath = this.getImportExportDirectory();

        const [uri] =
            (await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { jsonFiles: ['json'] },
                openLabel: 'Import Code Paths',
                defaultUri: vscode.Uri.file(defaultPath),
            })) || [];

        if (!uri) {
            return;
        }

        const contentBytes = await vscode.workspace.fs.readFile(uri);
        const content = contentBytes.toString();

        try {
            const importedPaths: any[] = JSON.parse(content);

            // Validate structure
            const isValid = Array.isArray(importedPaths) && importedPaths.every(pathData => {
                return (
                    typeof pathData.label === 'string' &&
                    typeof pathData.id === 'string' &&
                    typeof pathData.creationTime === 'string' &&
                    typeof pathData.colorName === 'string' &&
                    Array.isArray(pathData.steps) &&
                    pathData.steps.every((step: any) =>
                        typeof step.filePath === 'string' &&
                        typeof step.lineNumber === 'number' &&
                        typeof step.stepNumber === 'number'
                    )
                );
            });

            if (!isValid) {
                vscode.window.showErrorMessage(
                    'Invalid JSON structure. Import aborted.'
                );
                return;
            }

            // Import paths
            for (const pathData of importedPaths) {
                const newPath = new CodePath(
                    pathData.label,
                    pathData.id,
                    new Date(pathData.creationTime),
                    pathData.colorName
                );

                if (pathData.steps) {
                    pathData.steps.forEach((stepData: any) => {
                        if (stepData.filePath) {
                            newPath.addStep(
                                stepData.filePath,
                                stepData.lineNumber,
                                stepData.columnNumber || 0,
                                stepData.codeSnippet
                            );
                        }
                    });
                }

                this.codePaths.push(newPath);
            }

            this.saveCodePaths();
            this.refresh();
            vscode.window.showInformationMessage(
                `Imported ${importedPaths.length} Code Path${importedPaths.length === 1 ? '' : 's'} successfully.`
            );
        } catch (error) {
            vscode.window.showErrorMessage(
                'Cannot import Code Paths. Invalid JSON file.'
            );
        }
    }

    // Drag and Drop implementation
    async handleDrag(source: (CodePath | PathStep)[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        // Only allow dragging steps, not entire paths
        const steps = source.filter(item => item instanceof PathStep) as PathStep[];
        if (steps.length === 0) {
            return;
        }

        // Serialize the step data
        const stepData = steps.map(step => ({
            id: step.id,
            pathId: step.pathId,
            stepNumber: step.stepNumber
        }));

        dataTransfer.set('application/vnd.code.tree.pathfinder', new vscode.DataTransferItem(stepData));
    }

    async handleDrop(target: CodePath | PathStep | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        const transferItem = dataTransfer.get('application/vnd.code.tree.pathfinder');
        if (!transferItem) {
            return;
        }

        const stepData = transferItem.value as Array<{ id: string; pathId: string; stepNumber: number }>;
        if (!stepData || stepData.length === 0) {
            return;
        }

        // Find the actual step object
        const draggedStepData = stepData[0];
        const sourcePath = this.getCodePath(draggedStepData.pathId);
        if (!sourcePath) {
            return;
        }

        const draggedStep = sourcePath.steps.find(s => s.id === draggedStepData.id);
        if (!draggedStep) {
            return;
        }

        let targetPath: CodePath | undefined;
        let targetIndex: number;

        // Get the current index of the dragged step first
        const sourceIndex = this.getStepIndex(sourcePath, draggedStep);
        if (sourceIndex === -1) {
            return;
        }

        if (target instanceof CodePath) {
            // Dropped on a path - add to the end
            targetPath = target;
            targetIndex = target.steps.length;
        } else if (target instanceof PathStep) {
            // Dropped on a step
            targetPath = this.getPathForStep(target);
            if (!targetPath) {
                return;
            }
            const targetStepIndex = this.getStepIndex(targetPath, target);

            // If moving forward (lower index to higher), insert AFTER target
            // If moving backward (higher index to lower), insert BEFORE target
            if (sourceIndex < targetStepIndex) {
                targetIndex = targetStepIndex + 1;
            } else {
                targetIndex = targetStepIndex;
            }
        } else {
            // Dropped on root - not allowed
            return;
        }

        // Only allow reordering within the same path
        if (sourcePath.id !== targetPath.id) {
            vscode.window.showWarningMessage('Steps can only be reordered within the same code path');
            return;
        }

        // Remove from old position
        const [movedStep] = sourcePath.steps.splice(sourceIndex, 1);

        // Adjust target index since we removed an item
        if (sourceIndex < targetIndex) {
            targetIndex--;
        }

        // Insert at new position
        sourcePath.steps.splice(targetIndex, 0, movedStep);

        // Renumber all steps
        sourcePath.steps.forEach((step, index) => {
            const newStepNumber = index + 1;
            step.stepNumber = newStepNumber;
            const fileName = step.resourceUri?.fsPath ? step.resourceUri.fsPath.split('/').pop() : '';
            step.label = `Step ${newStepNumber}: ${fileName}`;
            step.id = `${sourcePath.id}-step-${newStepNumber}`;
        });

        // Save and refresh
        this.saveCodePaths();
        this.refresh();
    }
}
