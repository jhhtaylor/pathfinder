import * as vscode from 'vscode';
import * as path from 'path';
import { PathStep } from './models/CodePath';

// Just the slice of the built-in Git extension API this file uses.
interface GitRepository {
    rootUri: vscode.Uri;
    getMergeBase(ref1: string, ref2: string): Promise<string | undefined>;
}
interface GitAPI {
    getRepository(uri: vscode.Uri): GitRepository | null;
    toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
}

const DEFAULT_BASE_CANDIDATES = ['origin/main', 'origin/master', 'main', 'master'];

async function getGitApi(): Promise<GitAPI | undefined> {
    const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitAPI }>('vscode.git');
    if (!extension) {
        return undefined;
    }
    const exports = extension.isActive ? extension.exports : await extension.activate();
    return exports.getAPI(1);
}

async function resolveBase(repo: GitRepository): Promise<string | undefined> {
    const configured = vscode.workspace.getConfiguration('pathfinder').get<string>('diffBase', '').trim();
    const candidates = configured ? [configured] : DEFAULT_BASE_CANDIDATES;
    for (const ref of candidates) {
        try {
            const base = await repo.getMergeBase('HEAD', ref);
            if (base) {
                return base;
            }
        } catch { /* ref does not exist, try the next one */ }
    }
    return configured ? undefined : 'HEAD';
}

export async function openStepChanges(step: PathStep) {
    const uri = step.resourceUri;
    if (!uri) {
        return;
    }
    const git = await getGitApi();
    const repo = git?.getRepository(uri);
    if (!git || !repo) {
        vscode.window.showWarningMessage('Open Changes needs the file to be inside a Git repository.');
        return;
    }
    const base = await resolveBase(repo);
    if (!base) {
        vscode.window.showWarningMessage('Could not find the "pathfinder.diffBase" ref in this repository.');
        return;
    }

    const line = Math.max(0, (step.lineNumber ?? 1) - 1);
    const label = base === 'HEAD' ? 'HEAD' : base.slice(0, 7);
    await vscode.commands.executeCommand(
        'vscode.diff',
        git.toGitUri(uri, base),
        uri,
        `${path.basename(uri.fsPath)} (${label} ↔ Working Tree)`,
        { selection: new vscode.Range(line, 0, line, 0) }
    );
}
