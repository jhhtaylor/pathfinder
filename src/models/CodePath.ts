import * as vscode from 'vscode';
import * as path from 'path';

export class CodePath extends vscode.TreeItem {
    steps: PathStep[] = [];
    id: string;
    creationTime: Date;
    colorName: string;

    constructor(
        label: string,
        id: string = '',
        creationTime: Date = new Date(),
        colorName?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'path';
        this.id = id;
        this.creationTime = creationTime;
        this.colorName = colorName || this.getRandomColor();
        this.iconPath = new vscode.ThemeIcon('location', new vscode.ThemeColor(this.colorName));
        this.updateDescription();
    }

    private getRandomColor(): string {
        const colors = [
            'charts.red',
            'charts.blue',
            'charts.green',
            'charts.yellow',
            'charts.orange',
            'charts.purple',
            'charts.pink'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    updateDescription() {
        const stepCount = this.steps.length;
        this.description = stepCount === 1 ? '1 step' : `${stepCount} steps`;
    }

    createPathStep(
        filePath: string,
        lineNumber: number,
        columnNumber: number = 0,
        codeSnippet?: string
    ): PathStep {
        const baseName = path.basename(filePath);
        const relativePath = this.getRelativePath(filePath);
        const stepNumber = this.steps.length + 1;

        const item = new PathStep(
            `Step ${stepNumber}: ${baseName}`,
            vscode.TreeItemCollapsibleState.None
        );

        item.resourceUri = vscode.Uri.file(filePath);
        item.lineNumber = lineNumber;
        item.columnNumber = columnNumber;
        item.codeSnippet = codeSnippet;
        item.stepNumber = stepNumber;

        // Only show path if it's useful (not just "." or empty)
        const showPath = relativePath && relativePath !== '.' && relativePath !== '';
        item.description = `Line ${lineNumber + 1}${showPath ? ' - ' + relativePath : ''}`;

        item.id = `${this.id}-step-${stepNumber}`;
        item.contextValue = 'step';
        item.pathId = this.id;

        // Command to navigate to the location when clicked
        item.command = {
            command: 'pathfinder.navigateToStep',
            title: 'Navigate to Step',
            arguments: [item]
        };

        // Use a numbered icon
        item.iconPath = new vscode.ThemeIcon('circle-outline');

        return item;
    }

    private getRelativePath(filePath: string): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return path.dirname(filePath);
        }

        const workspaceFolder = workspaceFolders[0].uri.fsPath;
        if (filePath.startsWith(workspaceFolder)) {
            const relative = path.relative(workspaceFolder, filePath);
            return path.dirname(relative);
        }

        return path.dirname(filePath);
    }

    addStep(
        filePath: string,
        lineNumber: number,
        columnNumber: number = 0,
        codeSnippet?: string
    ) {
        if (!filePath) {
            vscode.window.showErrorMessage('Cannot interpret file path.');
            return;
        }
        this.steps.push(this.createPathStep(filePath, lineNumber, columnNumber, codeSnippet));
        this.updateDescription();
    }

    removeStep(stepNumber: number) {
        if (stepNumber > 0 && stepNumber <= this.steps.length) {
            this.steps.splice(stepNumber - 1, 1);
            // Renumber remaining steps
            this.renumberSteps();
            this.updateDescription();
        }
    }

    private renumberSteps() {
        this.steps.forEach((step, index) => {
            const newStepNumber = index + 1;
            step.stepNumber = newStepNumber;
            step.label = `Step ${newStepNumber}: ${path.basename(step.resourceUri?.fsPath || '')}`;
            step.id = `${this.id}-step-${newStepNumber}`;
        });
    }
}

export class PathStep extends vscode.TreeItem {
    pathId?: string;
    lineNumber?: number;
    columnNumber?: number;
    codeSnippet?: string;
    stepNumber?: number;
}
