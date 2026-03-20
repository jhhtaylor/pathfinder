# Changelog

All notable changes to the Pathfinder extension will be documented in this file.

## [0.2.6] - 2026-03-20

### Fixed

- **Windows: Call Hierarchy view empty** — workspace path comparison was case-sensitive, causing the TypeScript language server's uppercase drive-letter URIs (`C:\...`) to never match VS Code's lowercase workspace folder paths (`c:\...`). All methods were incorrectly treated as external and hidden.

## [0.2.5] - 2026-03-19

### Added

- **Step labels**: right-click (or click the pencil icon on) any step to add a note that appends to its auto-generated label — e.g. `Step 1: extension.ts — validate input`. Leave the note empty to reset to the default. Thanks @Chikowitz for the suggestion!

## [0.2.4] - 2026-03-19

### Improved

- **Call Hierarchy navigation**: clicking a child node now creates a clean back-navigation history entry at the root method, so pressing back always returns to the parent method in the original file rather than an arbitrary cursor position
  - Navigating to a child method first records the root ancestor's position, making single back-press reliable across any depth of call chain
  - Returning to the original file automatically highlights the method at the current cursor position in the Call Hierarchy panel
  - Recursive and mutually-recursive calls are detected and shown as non-expandable leaf nodes labelled `methodName (recursive)`, preventing infinite tree expansion

## [0.2.3] - 2025-12-08

### Added
- Sponsor link in package.json and marketplace page
- Support message in README.md

## [0.1.3] - 2025-11-21

### Added
- Import and export code paths to/from JSON files
- Configurable play delay setting (0.5-10 seconds, default: 1.5s)
- Pause, resume, and stop controls during code path playback
- Collapse all/expand all toggle button for code paths
- More options menu with links to settings, feedback, and support
- Setting to disable name prompts (automatically names paths "Code Path 1", "Code Path 2", etc.)
- Comprehensive unit tests for data provider and models

### Fixed
- ESLint configuration to properly recognize Node.js globals (setTimeout, etc.)

## [0.1.1-0.1.2] - 2025-11-09

### Changed
- Updated extension name to "pathfinder-code-paths" to avoid marketplace conflicts
- Updated display name to "Pathfinder - Code Paths"
- Added orange gallery banner to marketplace page
- Added repository information and GitHub links

## [0.1.0] - 2025-11-09

### Added
- Create and manage code paths to track code logic flows
- Add code locations to paths via right-click context menu
- Navigate between steps using sidebar or keyboard shortcuts
- Drag and drop steps to reorder them within a path
- Play mode for automatic walkthrough of code paths with visual highlighting
- Persistent storage per workspace
- Default naming for code paths ("Code Path 1", "Code Path 2", etc.)
- Auto-delete empty code paths when last step is removed
- Keyboard shortcuts:
  - `Cmd+Alt+P` / `Ctrl+Alt+P` - Add to code path
  - `Cmd+Alt+Down` / `Ctrl+Alt+Down` - Next step
  - `Cmd+Alt+Up` / `Ctrl+Alt+Up` - Previous step

### Features
- Rename code paths
- Delete code paths
- Remove individual steps
- View file location and line number for each step
- Collapsible/expandable code path groups in sidebar
