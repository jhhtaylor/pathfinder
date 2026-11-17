import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CodePath, PathStep } from './models/CodePath';
import { PathData, STEP_KIND_STYLES, StepData, StepKind, findAnchoredLine, parsePathFile, resolveStepFile, toPortablePath } from './pathFile';
import { RepoInfo, createRepoResolver } from './copyOperations';

const PATH_FILE_GLOB = '**/*pathfinder*.json';

export class PathfinderDataProvider implements vscode.TreeDataProvider<CodePath | PathStep>, vscode.TreeDragAndDropController<CodePath | PathStep> {
    private _onDidChangeTreeData: vscode.EventEmitter<CodePath | PathStep | undefined | null | void> = new vscode.EventEmitter<CodePath | PathStep | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CodePath | PathStep | undefined | null | void> = this._onDidChangeTreeData.event;

    private _onDidChangeCurrentStep = new vscode.EventEmitter<PathStep | undefined>();
    readonly onDidChangeCurrentStep = this._onDidChangeCurrentStep.event;

    private codePaths: CodePath[] = [];
    private workspaceState: vscode.Memento;
    private currentStep: PathStep | undefined;

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
        if (element instanceof PathStep) {
            const isCurrent = element === this.currentStep;
            const kind = element.kind && STEP_KIND_STYLES[element.kind];
            element.iconPath = isCurrent
                ? new vscode.ThemeIcon('debug-stackframe', new vscode.ThemeColor('charts.yellow'))
                : new vscode.ThemeIcon(kind?.icon ?? 'circle-outline', kind?.color ? new vscode.ThemeColor(kind.color) : undefined);
            const showCheckboxes = vscode.workspace.getConfiguration('pathfinder').get<boolean>('showReviewCheckboxes', true);
            element.checkboxState = showCheckboxes
                ? (element.reviewed ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked)
                : undefined;
            element.tooltip = stepTooltip(element);
        } else {
            element.updateDescription();
            element.tooltip = element.summary ? new vscode.MarkdownString(element.summary) : undefined;
        }
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

    getStep(pathId: string, stepNumber: number): PathStep | undefined {
        return this.getCodePath(pathId)?.steps.find(s => s.stepNumber === stepNumber);
    }

    getCurrentStep(): PathStep | undefined {
        const step = this.currentStep;
        if (step && step.pathId && this.getCodePath(step.pathId)?.steps.includes(step)) {
            return step;
        }
        return undefined;
    }

    setCurrentStep(step: PathStep | undefined) {
        if (step === this.currentStep) {
            return;
        }
        this.currentStep = step;
        this.refresh();
        this._onDidChangeCurrentStep.fire(step);
    }

    setStepReviewed(step: PathStep, reviewed: boolean) {
        step.reviewed = reviewed || undefined;
        this.saveCodePaths();
        this.refresh();
    }

    setStepKind(step: PathStep, kind: StepKind | undefined) {
        step.kind = kind;
        this.saveCodePaths();
        this.refresh();
    }

    setPathSummary(pathId: string, summary: string | undefined) {
        const codePath = this.getCodePath(pathId);
        if (codePath) {
            codePath.summary = summary || undefined;
            this.saveCodePaths();
            this.refresh();
        }
    }

    moveStepLine(step: PathStep, lineNumber: number) {
        const codePath = step.pathId ? this.getCodePath(step.pathId) : undefined;
        if (codePath && step.lineNumber !== lineNumber) {
            codePath.setStepLine(step, lineNumber);
            this.saveCodePaths();
            this.refresh();
        }
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

    renameStep(pathId: string, stepNumber: number, customLabel: string | undefined) {
        const codePath = this.getCodePath(pathId);
        if (!codePath) { return; }
        const step = codePath.steps.find(s => s.stepNumber === stepNumber);
        if (!step) { return; }
        step.customLabel = customLabel || undefined;
        step.label = CodePath.stepDisplayLabel(stepNumber, step.resourceUri?.fsPath || '', step.customLabel);
        this.saveCodePaths();
        this.refresh();
    }

    // `portable` maps an absolute path to what a shared file should store.
    private serializePath(p: CodePath, portable?: (fsPath: string) => Pick<StepData, 'filePath' | 'repo'>): PathData {
        return {
            label: p.label as string,
            id: p.id,
            creationTime: p.creationTime.toISOString(),
            colorName: p.colorName,
            summary: p.summary,
            steps: p.steps.map(step => {
                const fsPath = step.resourceUri?.fsPath || '';
                return {
                    ...(portable ? portable(fsPath) : { filePath: fsPath }),
                    kind: step.kind,
                    lineNumber: step.lineNumber!,
                    columnNumber: step.columnNumber,
                    codeSnippet: step.codeSnippet,
                    customLabel: step.customLabel,
                    detail: step.detail,
                    // Review progress is personal, so it stays out of shared files.
                    reviewed: portable ? undefined : step.reviewed,
                };
            })
        };
    }

    private restorePath(data: PathData, lineNumberOffset = 0): CodePath {
        const restored = new CodePath(
            data.label,
            data.id || `path-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            data.creationTime ? new Date(data.creationTime) : new Date(),
            data.colorName
        );
        restored.summary = data.summary;
        for (const stepData of data.steps) {
            if (!stepData.filePath) {
                continue;
            }
            const step = restored.addStep(
                stepData.filePath,
                stepData.lineNumber + lineNumberOffset,
                stepData.columnNumber || 0,
                stepData.codeSnippet,
                stepData.customLabel
            );
            if (step) {
                step.kind = stepData.kind;
                step.detail = stepData.detail;
                step.reviewed = stepData.reviewed || undefined;
            }
        }
        restored.updateDescription();
        return restored;
    }

    private saveCodePaths() {
        this.workspaceState.update('pathfinder.codePaths', this.codePaths.map(p => this.serializePath(p)));
        this.workspaceState.update('pathfinder.lineNumbers1Based', true);
    }

    private loadCodePaths() {
        const saved = this.workspaceState.get<any[]>('pathfinder.codePaths', []);
        const migrated = this.workspaceState.get<boolean>('pathfinder.lineNumbers1Based', false);
        this.codePaths = saved.map(data => this.restorePath({ ...data, steps: data.steps ?? [] }, migrated ? 0 : 1));
        if (!migrated && saved.length > 0) {
            this.workspaceState.update('pathfinder.lineNumbers1Based', true);
            this.saveCodePaths();
        }
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

    private workspaceRoots(): string[] {
        return (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
    }

    private getConfiguredDirectory(): string | undefined {
        const configuredPath = vscode.workspace
            .getConfiguration('pathfinder')
            .get<string>('importExportDirectory', '')
            .trim();

        if (configuredPath === '') {
            return undefined;
        }
        if (path.isAbsolute(configuredPath)) {
            return configuredPath;
        }
        return path.resolve(this.workspaceRoots()[0] ?? os.homedir(), configuredPath);
    }

    private getImportDialogDirectory(): string {
        const active = vscode.window.activeTextEditor?.document.uri;
        const activeDir = active?.scheme === 'file' ? path.dirname(active.fsPath) : undefined;
        return this.getConfiguredDirectory()
            ?? activeDir
            ?? this.workspaceState.get<string>('pathfinder.lastImportDir')
            ?? this.workspaceRoots()[0]
            ?? os.homedir();
    }

    async exportCodePathsToFile(): Promise<void> {
        const defaultPath = this.getConfiguredDirectory() ?? this.workspaceRoots()[0] ?? os.homedir();

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

        const roots = this.workspaceRoots();
        const resolveRepo = createRepoResolver();
        const repos = new Map<string, RepoInfo | undefined>();
        for (const step of this.codePaths.flatMap(p => p.steps)) {
            const fsPath = step.resourceUri?.fsPath;
            if (fsPath && !repos.has(fsPath)) {
                repos.set(fsPath, await resolveRepo(path.dirname(fsPath)));
            }
        }
        // Paths are stored relative to their git repo, named by its remote, so a
        // teammate with the same repos checked out anywhere can import the file.
        const portable = (fsPath: string) => {
            const repo = repos.get(fsPath);
            return repo
                ? { filePath: toPortablePath(fsPath, [repo.root]), repo: repo.name }
                : { filePath: toPortablePath(fsPath, roots) };
        };
        const content = JSON.stringify(this.codePaths.map(p => this.serializePath(p, portable)), null, 2);

        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        vscode.window.showInformationMessage('Code Paths exported successfully.');
    }

    async importCodePathsFromFile(): Promise<void> {
        const found = await vscode.workspace.findFiles(PATH_FILE_GLOB, '**/node_modules/**', 200);
        if (found.length > 0) {
            const withTimes = await Promise.all(found.map(async uri => {
                try {
                    return { uri, mtime: (await vscode.workspace.fs.stat(uri)).mtime };
                } catch {
                    return { uri, mtime: 0 };
                }
            }));
            withTimes.sort((a, b) => b.mtime - a.mtime);

            interface FileItem extends vscode.QuickPickItem { uri?: vscode.Uri; }
            const items: FileItem[] = [
                ...withTimes.map(({ uri, mtime }) => ({
                    label: `$(file) ${path.basename(uri.fsPath)}`,
                    description: path.dirname(vscode.workspace.asRelativePath(uri)),
                    detail: mtime ? `Modified ${new Date(mtime).toLocaleString()}` : undefined,
                    uri
                })),
                { label: '$(folder-opened) Browse...', alwaysShow: true }
            ];
            const picked = await vscode.window.showQuickPick<FileItem>(items, {
                placeHolder: 'Import code paths from a file in this workspace'
            });
            if (!picked) {
                return;
            }
            if (picked.uri) {
                await this.importFromUri(picked.uri);
                return;
            }
        }

        const [uri] =
            (await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { jsonFiles: ['json'] },
                openLabel: 'Import Code Paths',
                defaultUri: vscode.Uri.file(this.getImportDialogDirectory()),
            })) || [];

        if (uri) {
            await this.importFromUri(uri);
        }
    }

    async importFromUri(uri: vscode.Uri): Promise<void> {
        this.workspaceState.update('pathfinder.lastImportDir', path.dirname(uri.fsPath));

        let data: PathData[];
        try {
            const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            data = parsePathFile(content);
        } catch (error) {
            vscode.window.showErrorMessage(`Cannot import Code Paths: ${error instanceof Error ? error.message : error}`);
            return;
        }

        const roots = [...this.workspaceRoots(), path.dirname(uri.fsPath)];
        const resolveRepo = createRepoResolver();
        const repoRoots = new Map<string, string>();
        for (const root of roots) {
            const repo = await resolveRepo(root);
            if (repo && !repoRoots.has(repo.name)) {
                repoRoots.set(repo.name, repo.root);
            }
        }
        const { added, replaced } = this.addImportedPaths(data, roots, repoRoots);
        const total = added + replaced;
        vscode.window.showInformationMessage(
            `Imported ${total} Code Path${total === 1 ? '' : 's'}${replaced ? ` (${replaced} replaced)` : ''}.`
        );
    }

    addImportedPaths(data: PathData[], roots: string[], repoRoots = new Map<string, string>()): { added: number; replaced: number } {
        let added = 0;
        let replaced = 0;
        const fileLines = new Map<string, string[] | undefined>();
        const readLines = (file: string) => {
            if (!fileLines.has(file)) {
                try {
                    fileLines.set(file, fs.readFileSync(file, 'utf8').split(/\r?\n/));
                } catch {
                    fileLines.set(file, undefined);
                }
            }
            return fileLines.get(file);
        };

        for (const pathData of data) {
            const steps = pathData.steps.map(s => {
                const repoRoot = s.repo ? repoRoots.get(s.repo) : undefined;
                const filePath = resolveStepFile(s.filePath, repoRoot ? [repoRoot, ...roots] : roots, fs.existsSync);
                const lines = readLines(filePath);
                if (!lines) {
                    return { ...s, filePath };
                }
                const lineNumber = findAnchoredLine(lines, s.lineNumber, s.codeSnippet);
                const codeSnippet = s.codeSnippet ?? lines[lineNumber - 1]?.trim();
                return { ...s, filePath, lineNumber, codeSnippet };
            });
            const restored = this.restorePath({ ...pathData, steps });

            const existingIndex = this.codePaths.findIndex(p =>
                pathData.id ? p.id === pathData.id : p.label === pathData.label
            );
            if (existingIndex !== -1) {
                restored.id = this.codePaths[existingIndex].id;
                restored.steps.forEach(s => { s.pathId = restored.id; s.id = `${restored.id}-step-${s.stepNumber}`; });
                this.codePaths[existingIndex] = restored;
                replaced++;
            } else {
                this.codePaths.push(restored);
                added++;
            }
        }

        this.saveCodePaths();
        this.refresh();
        return { added, replaced };
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
            step.label = CodePath.stepDisplayLabel(newStepNumber, step.resourceUri?.fsPath || '', step.customLabel);
            step.id = `${sourcePath.id}-step-${newStepNumber}`;
        });

        // Save and refresh
        this.saveCodePaths();
        this.refresh();
    }
}

function stepTooltip(step: PathStep): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**Step ${step.stepNumber}** · \`${path.basename(step.resourceUri?.fsPath || '')}:${step.lineNumber}\``);
    if (step.kind) {
        md.appendMarkdown(` · ${STEP_KIND_STYLES[step.kind].label}`);
    }
    if (step.customLabel) {
        md.appendMarkdown(`\n\n${step.customLabel}`);
    }
    if (step.detail) {
        md.appendMarkdown(`\n\n${step.detail}`);
    }
    if (step.codeSnippet) {
        md.appendMarkdown('\n\n');
        md.appendCodeblock(step.codeSnippet);
    }
    return md;
}
