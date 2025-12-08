<p align="center">
  <img src="media/pathfinder.png" alt="Pathfinder Logo" width="200"/>
</p>

# Pathfinder - Code Path Tracker

Track and navigate through code logic flows by marking lines of code.

## Support the creator

<a href="https://www.buymeacoffee.com/jhhtaylor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

Love this extension? You can support its development with a small donation - completely optional! Your support helps me keep creating and improving tools like this.

## Features

- **Create Code Paths**: Organize related code locations into named paths
- **Add Code Locations**: Right-click on any line to add it to a code path
- **Navigate Through Paths**: Jump between steps in your code path
- **Play Mode**: Automatically walk through all steps in a path
- **Persistent Storage**: Your code paths are saved per workspace

## Usage

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

## Requirements

VS Code version 1.99.0 or higher

## Known Issues

If you encounter any problem, please open an [Issue](https://github.com/jhhtaylor/pathfinder/issues) on the GitHub repository.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes and releases.
