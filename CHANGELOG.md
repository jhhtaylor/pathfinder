# Changelog

All notable changes to the Pathfinder extension will be documented in this file.

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
