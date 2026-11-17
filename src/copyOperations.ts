import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { promisify } from 'util';
import { CodePath, PathStep } from './models/CodePath';

const execFileAsync = promisify(execFile);

export function extractRepoNameFromUrl(remoteUrl: string): string | undefined {
    return remoteUrl.trim().match(/[/:]([^/:]+?)(\.git)?\/?$/)?.[1];
}

async function git(cwd: string, ...args: string[]): Promise<string | undefined> {
    try {
        const { stdout } = await execFileAsync('git', args, { cwd });
        return stdout.trim() || undefined;
    } catch {
        return undefined;
    }
}

export interface RepoInfo {
    root: string;
    name: string;
}

async function repoAt(dir: string): Promise<RepoInfo | undefined> {
    const top = await git(dir, 'rev-parse', '--show-toplevel');
    if (!top) {
        return undefined;
    }
    const root = path.normalize(top);
    const remoteUrl = await git(root, 'config', '--get', 'remote.origin.url');
    return { root, name: (remoteUrl && extractRepoNameFromUrl(remoteUrl)) || path.basename(root) };
}

// Caches by directory so exporting or importing a long path runs git once per folder.
export function createRepoResolver(): (dir: string) => Promise<RepoInfo | undefined> {
    const cache = new Map<string, Promise<RepoInfo | undefined>>();
    return dir => {
        if (!cache.has(dir)) {
            cache.set(dir, existsSync(dir) ? repoAt(dir) : Promise.resolve(undefined));
        }
        return cache.get(dir)!;
    };
}

export async function getRepoRoot(uri: vscode.Uri): Promise<string | undefined> {
    let dir = path.dirname(uri.fsPath);
    while (!existsSync(dir) && path.dirname(dir) !== dir) {
        dir = path.dirname(dir);
    }
    const root = await git(dir, 'rev-parse', '--show-toplevel');
    return root ? path.normalize(root) : vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

export async function getRepoName(uri: vscode.Uri): Promise<string | undefined> {
    const root = await getRepoRoot(uri);
    if (!root) {
        return undefined;
    }
    const remoteUrl = await git(root, 'config', '--get', 'remote.origin.url');
    return (remoteUrl && extractRepoNameFromUrl(remoteUrl)) || path.basename(root);
}

function relativePath(uri: vscode.Uri): string {
    return vscode.workspace.asRelativePath(uri, false);
}

const COMMENT_STYLES: [string[], (text: string) => string][] = [
    [['coffeescript', 'perl', 'python', 'r', 'ruby', 'shellscript', 'yaml', 'dockercompose', 'dockerfile', 'erlang', 'ini', 'makefile', 'powershell', 'toml'], t => `# ${t}`],
    [['html', 'markdown', 'svelte', 'vue', 'vue-html', 'xml', 'xsl'], t => `<!-- ${t} -->`],
    [['css', 'less', 'scss', 'stylus'], t => `/* ${t} */`],
    [['bibtex', 'latex', 'tex'], t => `% ${t}`],
    [['clojure'], t => `;; ${t}`],
    [['lua', 'sql', 'haskell'], t => `-- ${t}`],
    [['razor'], t => `@* ${t} *@`],
    [['vb'], t => `' ${t}`],
    [['handlebars'], t => `{{!-- ${t} --}}`],
    [['bat'], t => `REM ${t}`],
    [['fsharp', 'ocaml'], t => `(* ${t} *)`],
    [['plaintext'], t => t],
];

export function commentFor(languageId: string, text: string): string {
    return COMMENT_STYLES.find(([languages]) => languages.includes(languageId))?.[1](text) ?? `// ${text}`;
}

export function stepIdentifier(repoName: string, fileName: string, lineNumber: number, note?: string): string {
    return `${repoName} - ${fileName} - line ${lineNumber}${note ? ` - ${note}` : ''}`;
}

// The same shape copy-repo-name's Cmd+Shift+C produces: an identifying comment, then the code.
async function stepWithCode(step: PathStep): Promise<string | undefined> {
    const uri = step.resourceUri;
    if (!uri || step.lineNumber === undefined) {
        return undefined;
    }
    let languageId = 'plaintext';
    let code = step.codeSnippet ?? '';
    try {
        const doc = await vscode.workspace.openTextDocument(uri);
        languageId = doc.languageId;
        if (step.lineNumber <= doc.lineCount) {
            code = doc.lineAt(step.lineNumber - 1).text.trim();
        }
    } catch { /* file missing: fall back to the saved snippet */ }
    const repoName = (await getRepoName(uri)) ?? 'Untitled';
    const identifier = stepIdentifier(repoName, path.basename(uri.fsPath), step.lineNumber, step.customLabel);
    return `${commentFor(languageId, identifier)}\n${code}`;
}

const STEP_COPIERS: Record<string, { label: string; get: (step: PathStep) => string | undefined | Promise<string | undefined> }> = {
    copyStepWithCode: { label: 'step with code', get: stepWithCode },
    copyRelativePath: { label: 'relative path', get: s => s.resourceUri && relativePath(s.resourceUri) },
    copyRelativePathWithLine: { label: 'relative path', get: s => s.resourceUri && `${relativePath(s.resourceUri)}:${s.lineNumber}` },
    copyPath: { label: 'path', get: s => s.resourceUri?.fsPath },
    copyFileName: { label: 'file name', get: s => s.resourceUri && path.parse(s.resourceUri.fsPath).name },
    copyFileNameWithExtension: { label: 'file name', get: s => s.resourceUri && path.basename(s.resourceUri.fsPath) },
    copyAtMention: { label: '@ mention', get: s => s.resourceUri && `@${relativePath(s.resourceUri)}` },
    copyRepoName: { label: 'repo name', get: s => s.resourceUri && getRepoName(s.resourceUri) },
};

async function copy(text: string, what: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage(`Pathfinder: copied ${what}`, 3000);
}

export function registerCopyCommands(context: vscode.ExtensionContext): void {
    for (const [command, copier] of Object.entries(STEP_COPIERS)) {
        context.subscriptions.push(
            vscode.commands.registerCommand(`pathfinder.${command}`, async (step?: PathStep) => {
                if (!(step instanceof PathStep)) {
                    return;
                }
                const text = await copier.get(step);
                if (!text) {
                    vscode.window.showWarningMessage(`Pathfinder: could not determine ${copier.label}.`);
                    return;
                }
                await copy(text, text.includes('\n') ? copier.label : `${copier.label}: ${text}`);
            })
        );
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('pathfinder.copyPathStepsWithCode', async (codePath?: CodePath) => {
            if (!(codePath instanceof CodePath) || codePath.steps.length === 0) {
                return;
            }
            const blocks = (await Promise.all(codePath.steps.map(stepWithCode))).filter(Boolean);
            await copy(blocks.join('\n\n'), `${blocks.length} step${blocks.length === 1 ? '' : 's'} with code`);
        }),
        vscode.commands.registerCommand('pathfinder.copyPathFilePaths', async (codePath?: CodePath) => {
            if (!(codePath instanceof CodePath)) {
                return;
            }
            const paths = [...new Set(codePath.steps.flatMap(s => (s.resourceUri ? [relativePath(s.resourceUri)] : [])))];
            if (paths.length === 0) {
                return;
            }
            await copy(paths.join('\n'), `${paths.length} file path${paths.length === 1 ? '' : 's'}`);
        })
    );
}
