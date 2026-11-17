<p align="center">
  <img src="media/pathfinder.png" alt="Pathfinder Logo" width="200"/>
</p>

# Pathfinder - Code Path Tracker

Track and navigate through code logic flows by marking lines of code.

## Support the creator

<a href="https://www.buymeacoffee.com/jhhtaylor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

Love this extension? You can support its development with a small donation - completely optional! Your support helps me keep creating and improving tools like this.

## Features

- **Call Hierarchy View**: Automatically visualises all methods in the active file and their outgoing calls, filtered to workspace code only
- **Create Code Paths**: Organize related code locations into named paths
- **Add Code Locations**: Right-click on any line to add it to a code path
- **Navigate Through Paths**: Jump between steps in your code path
- **Play Mode**: Automatically walk through all steps in a path
- **Inline Notes**: Each step's number and note appear at the end of its line, with a hover for details and next/previous links
- **Path Map**: A side panel that follows you through the path, showing which function each step sits in and whether it calls, or returns to, the next one
- **Review Tracking**: Tick off steps as you review them and see progress in the sidebar, the path map and the status bar
- **Step Kinds**: Mark steps as new, changed, context or test code, each with its own icon and colour
- **Open Changes**: Diff a step's file against your base branch to see what was changed there
- **Shareable Files**: Exported files use workspace-relative paths, so they work on a teammate's machine
- **Copy as Mermaid**: Paste a code path into a PR description or doc as a diagram
- **Persistent Storage**: Your code paths are saved per workspace

## Usage

### Call Hierarchy View

The Call Hierarchy panel appears at the top of the Pathfinder sidebar and automatically refreshes when you switch files. It shows every method in the active file along with the workspace methods each one calls, up to 3 levels deep by default.

- Click any node to navigate to that method
- Use the depth toggle buttons in the panel toolbar to switch between 3 levels and all levels
- Pressing back after navigating to a child method returns you to the parent method in the original file
- Recursive calls are shown as non-expandable leaf nodes labelled `methodName (recursive)`
- Right-click any node to go to its definition or add it to a code path

### Creating a Code Path

1. Click the `+` icon in the Pathfinder sidebar, or
2. Use the command palette: `Pathfinder: Create New Code Path`
3. Enter a name for your code path (e.g., "User Authentication Flow")

### Adding Steps to a Path

1. Navigate to the line of code you want to add
2. Right-click in the editor
3. Select `Add to Code Path...`
4. Choose which code path to add it to, or create a new one

Alternatively, use the keyboard shortcut:
- **Mac**: `Cmd+Alt+P`
- **Windows/Linux**: `Ctrl+Alt+P`

### Navigating Through Steps

#### From the Sidebar
Click on any step in the sidebar to jump to that location in your code.

#### Using Keyboard Shortcuts
- **Next Step**: `Cmd+Alt+Down` (Mac) or `Ctrl+Alt+Down` (Windows/Linux)
- **Previous Step**: `Cmd+Alt+Up` (Mac) or `Ctrl+Alt+Up` (Windows/Linux)

### Playing a Code Path

Click the play icon (▶) next to a code path in the sidebar to automatically walk through all steps with a 1.5-second delay between each step.

### Managing Code Paths

- **Rename**: Click the pencil icon next to a code path
- **Delete**: Click the trash icon next to a code path
- **Remove Step**: Click the trash icon next to a specific step
- **Label a Step**: Click the pencil icon next to a step (or right-click → Rename Step...) to append a note to its label, e.g. `Step 1: handler.ts — validate input`. Leave empty to clear.
- **Summary**: Right-click a code path and choose Edit Summary... to describe what it covers and why
- **Copy**: Right-click a step and open the Copy menu for its relative path (with or without the line), absolute path, file name, @ mention, repo name, or **Copy Step With Code**. That last one copies a comment naming the repo, file, line and step note, with the line of code under it. Right-click a code path to copy every step with its code, the list of files it touches, or a Mermaid diagram

### Reviewing a Code Path

While you walk a path, the step you are on is highlighted in the sidebar and shown in the status bar (click it to move on). Every step line in an open editor shows its number and note at the end of the line. Hover over the line for the step's details, the path summary, and links to the previous and next step, the path map, and the file's changes.

Click the map icon next to a code path to open the **Path Map**. It lists the steps grouped by file, names the function each step sits in, and labels how each step connects to the next. Those labels come from the code itself, using the language server's call hierarchy, with a text search as a fallback for languages that lack one:

- **calls**: the next step's function is called from this one
- **returns to**: this step's function was called from the next one
- **same function**: both steps are in the same function
- **then**: no call between them was found

Right-click a step and choose **Set Kind...** to mark it as **New** (code added for this change), **Changed** (existing code modified), **Context** (unchanged code that explains the flow) or **Test**. Kinds show as coloured icons in the sidebar, as tags in the path map, inline notes and hover, and as coloured outlines in Mermaid diagrams.

Tick the checkbox on a step once you have reviewed it. Right-click a step and choose **Open Changes** to diff its file against the merge base with your main branch, or against `pathfinder.diffBase` if set.

### Importing and Exporting

Click the import icon at the top of the Code Paths view. Pathfinder lists every `*pathfinder*.json` file in the workspace, newest first, so most imports never open a file dialog. Choose **Browse...** to pick a file elsewhere; the dialog opens in the folder of the file you are editing. You can also right-click any `.json` file in the Explorer and choose **Import into Pathfinder**.

Re-importing a file replaces paths with the same `id` (or the same label when there is no `id`), so you can import an updated file without getting duplicates. If code has moved since the file was written, each step follows its `codeSnippet` to the line where it now lives.

Export is under the `...` menu. Each step is saved relative to its Git repository, along with the repository's name (taken from its `origin` remote), so a file you share works on someone else's machine. A path can span several repositories: open them together in a multi-root workspace, and on import each step is matched to the workspace folder of the repo it names. Older files with absolute paths are matched to the current workspace when imported.

### Writing Pathfinder Files with an AI

Pathfinder is handy for walking through a feature an AI agent wrote for you. Ask the agent to write a `<name>.pathfinder.json` file at the root of the repo alongside its changes. Only `label`, `steps`, `filePath` and `lineNumber` are required:

```json
{
  "label": "PROJ-123 Token refresh",
  "summary": "Expired access tokens are now refreshed once before the request is retried.",
  "steps": [
    {
      "filePath": "src/api/client.ts",
      "lineNumber": 42,
      "codeSnippet": "if (res.status === 401 && !retried) {",
      "customLabel": "Catch the 401",
      "kind": "changed",
      "detail": "Only retries once, so a revoked refresh token cannot loop."
    }
  ]
}
```

You can paste this into your `CLAUDE.md`, `AGENTS.md` or equivalent:

```markdown
When you finish a feature or ticket, write `<ticket>.pathfinder.json` in the repo root so I can review it
with the Pathfinder VS Code extension. Format: { "label", "summary", "steps": [{ "filePath", "lineNumber",
"codeSnippet", "customLabel", "detail", "kind" }] }. filePath is relative to the repo root, lineNumber is
1-based, codeSnippet is the trimmed text of that line, customLabel is a short note (under 60 characters),
detail explains why the code is there, and kind is "new", "changed", "context" or "test". Order the steps in
the order the code runs, starting at the entry point, and include only the lines a reviewer needs to
understand the change. If the change spans several repos, add "repo" (the repo name) to each step.
```

The file can also hold an array of paths, or `{ "paths": [...] }`.

## Commands

- `Pathfinder: Create New Code Path` - Create a new code path
- `Pathfinder: Add to Code Path...` - Add current line to a code path
- `Pathfinder: Go to Next Step` - Navigate to the next step
- `Pathfinder: Go to Previous Step` - Navigate to the previous step
- `Pathfinder: Import Code Paths...` - Import from a workspace file or browse for one
- `Pathfinder: Export Code Paths...` - Export all code paths to a JSON file
- `Pathfinder: Show Path Map` - Open the path map for the current code path
- `Pathfinder: Copy as Mermaid Diagram` - Copy a code path as a Mermaid flowchart

## Extension Settings

This extension stores code paths in your workspace state.

- `pathfinder.showInlineNotes`: show step notes at the end of their lines (default `true`)
- `pathfinder.showReviewCheckboxes`: show review checkboxes on steps (default `true`)
- `pathfinder.diffBase`: Git ref for Open Changes; empty uses the merge base with `origin/main`, `origin/master`, `main` or `master`
- `pathfinder.importExportDirectory`: fixed folder for the import and export dialogs
- `pathfinder.playDelaySeconds`: delay between steps when playing a path (default `1.5`)
- `pathfinder.promptForName`: ask for a name when creating a path (default `false`)

## Use Cases

- **Code Review**: Mark important sections of code during review
- **Learning**: Create paths through unfamiliar codebases
- **Debugging**: Track the flow of execution through your code
- **Documentation**: Create guided tours of your codebase
- **Onboarding**: Help new team members understand code flows

## Call Hierarchy Language Compatibility

The Call Hierarchy view depends on the installed language server extension advertising outgoing call hierarchy support. Languages tested:

| Language | Extension required | Call Hierarchy |
|---|---|---|
| TypeScript / JavaScript | Built-in | ✅ Full tree |
| Go | gopls | ✅ Full tree |
| Java | Language Support for Java (Red Hat) | ✅ Full tree |
| Python | Pylance | ✅ Full tree |
| C / C++ | clangd | ✅ Full tree |
| Rust | rust-analyzer | ⚠️ Works, some known bugs |
| C# | OmniSharp / C# Dev Kit | ✅ Best-effort tree (via definition lookup) |
| Ruby | Solargraph / Ruby LSP | ✅ Best-effort tree (via definition lookup) |
| PHP | Intelephense | ✅ Best-effort tree (via definition lookup) |
| Kotlin | Kotlin Language Server | ✅ Best-effort tree (via definition lookup) |

Languages in the "best-effort" row use definition and implementation lookup to build the call tree. Expansion may be incomplete for calls through dynamic dispatch or lambdas. A banner in the panel indicates this mode.

**Interface / abstract calls**: for all languages, Pathfinder prefers the concrete implementation over the interface declaration when building the call tree. Right-clicking a node and choosing **Go to Definition** navigates to the interface or abstract declaration instead. The Code Paths feature works for all languages regardless.

## Requirements

VS Code version 1.99.0 or higher

## Known Issues

If you encounter any problem, please open an [Issue](https://github.com/jhhtaylor/pathfinder/issues) on the GitHub repository.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes and releases.
