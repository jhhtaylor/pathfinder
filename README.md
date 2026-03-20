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

## Commands

- `Pathfinder: Create New Code Path` - Create a new code path
- `Pathfinder: Add to Code Path...` - Add current line to a code path
- `Pathfinder: Go to Next Step` - Navigate to the next step
- `Pathfinder: Go to Previous Step` - Navigate to the previous step

## Extension Settings

This extension stores code paths in your workspace state.

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
| C# | OmniSharp / C# Dev Kit | 🔄 Methods listed for navigation only |
| Ruby | Solargraph / Ruby LSP | 🔄 Methods listed for navigation only |
| PHP | Intelephense | 🔄 Methods listed for navigation only |
| Kotlin | Kotlin Language Server | 🔄 Methods listed for navigation only |

For languages in the 🔄 row, the panel shows all methods in the file as clickable navigation items with a note explaining that outgoing call hierarchy is unsupported. The Code Paths feature works for all languages regardless.

## Requirements

VS Code version 1.99.0 or higher

## Known Issues

If you encounter any problem, please open an [Issue](https://github.com/jhhtaylor/pathfinder/issues) on the GitHub repository.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes and releases.
