# Changelog

All notable changes to the Pathfinder extension will be documented in this file.

## [0.3.2] - 2026-11-18

### Fixed

- Clicks in the path map are no longer lost when the map refreshes mid-click, which could happen while call analysis finished.
- Copy as Mermaid no longer waits forever on a slow or stalled language server. It copies after at most a few seconds, with whatever symbols are known.
- The path map retries call analysis when the language server returned nothing, instead of caching the empty result.

## [0.3.1] - 2026-11-18

### Fixed

- Clicking a step in the path map opens it in the editor group beside the map instead of covering the map, and a file that is already open is shown in the group where it is open.

## [0.3.0] - 2026-11-17

### Added

- **Inline notes**: every step line shows its number and note at the end of the line, like Git blame annotations. Hovering shows the step's details and links to the previous and next step, the path map, and the file's changes. Toggle with `pathfinder.showInlineNotes`.
- **Path Map**: a side panel that follows you through a code path. It names the function each step is in and labels whether it calls, or returns to, the next step, based on the language server's call hierarchy with a text-search fallback.
- **Copy as Mermaid Diagram**: copies a code path as a Mermaid flowchart grouped by file, for PR descriptions and docs.
- **Copy menus**: right-click a step for Copy Step With Code (a comment like `// repo - file.ts - line 42 - note` followed by the line), Copy Relative Path, Copy Relative Path With Line, Copy Path, Copy File Name, Copy File Name With Extension, Copy as @ Mention and Copy Repo Name. Right-click a code path for Copy Steps With Code, Copy File Paths and Copy as Mermaid Diagram.
- **Step kinds**: mark a step as New, Changed, Context or Test (right-click → Set Kind..., or `"kind"` in the JSON). Each kind has its own icon and colour in the sidebar and a tag in the path map, inline note and hover. Mermaid diagrams outline new, changed and test steps in colour.
- **Paths across repositories**: exported steps store their path relative to their Git repo plus a `repo` name taken from the `origin` remote. On import, each step is matched to the workspace folder for that repo, so one path can walk through several repos in a multi-root workspace, even when they share file names.
- **Path colour in the path map**: the header and progress bar use the code path's colour.
- **Review tracking**: checkboxes on steps, a reviewed count on each path, and a status bar item showing the current step that moves to the next one when clicked.
- **Open Changes**: diffs a step's file against the merge base with the main branch (or `pathfinder.diffBase`).
- **Path summaries and step details**: paths can carry a summary and steps a longer `detail`, shown on hover and in the path map.
- **Import from the workspace**: the import button lists `*pathfinder*.json` files in the workspace, newest first. JSON files can also be imported from the Explorer context menu.

### Changed

- Import now has its own button at the top of the Code Paths view, and New Code Path uses a `+` icon so the two are easier to tell apart. An empty view shows Import and New buttons.
- The import dialog opens in the folder of the active file instead of the workspace root.
- Next/Previous Step continue from the last visited step when the cursor is not on a step.
- Imports accept files with only `label` and `steps`, `{ "paths": [...] }`, or a single path object, and report which field is wrong when a file is rejected.

### Fixed

- **Shared files pointed at the author's machine**: exports now store workspace-relative paths, and importing an older file with absolute paths matches them to the current workspace.
- **Re-importing duplicated paths**: importing a path with an existing `id` (or label, when there is no `id`) now replaces it.
- **Steps drifting after edits**: when a step's line no longer matches its saved snippet, Pathfinder moves the step to the nearest line that does, both on import and when navigating.
- Navigating to a step whose file is missing now shows an error instead of failing silently.

## [0.2.12] - 2026-07-16

### Fixed

- **Package size**: added a missing `.vscodeignore`, so the published extension no longer bundles its TypeScript source, compiled test output, dev configs, and a local Claude Code settings file. No secrets were included in any of it, but it cut the package from ~196KB to ~76KB.

## [0.2.11] - 2026-06-17

### Fixed

- **Import/export line numbers off by one**: line numbers in JSON files are now stored as 1-based (matching what editors display) instead of 0-based. Importing a file with `lineNumber: 56` now correctly shows "Line 56" and navigates to line 56. Existing workspace data is migrated automatically on first load.

## [0.2.10] - 2026-03-23

### Improved

- **Interface → implementation resolution**: for all supported languages, Pathfinder now prefers the concrete implementation over the interface declaration when building the call tree. Calls through interface-typed variables (e.g. `_service.Process()` where `_service: IService`) resolve directly to the implementing class rather than the interface. Works in both the native call hierarchy path (TypeScript, Go, Java, Python, C/C++) and the best-effort path (C#, Ruby, PHP, Kotlin).

### Fixed

- **"Go to Definition" now navigates to the interface/declaration**: previously this command was identical to clicking the node (navigated to the implementation). It now correctly navigates to the interface or abstract declaration. The stored definition item is used when available; otherwise the language server's definition provider is called at the node's position.
- **Panel clears when clicking the sidebar**: fixed a race where switching files queued a 400 ms refresh timer that then fired after focus moved to the sidebar, clearing the panel. The timer is now also cancelled on focus-out so the panel stays populated.
- **False "(recursive)" nodes from method signatures**: the best-effort scanner was including the method's own declaration line in the scan range, causing the method's name in its signature to resolve back to itself. Fixed by scanning only after the opening `{` or `=>`. Interface methods and abstract declarations (which have no body) are now treated as leaves immediately.

## [0.2.9] - 2026-03-21

### Improved

- **Best-effort call hierarchy for unsupported languages**: C#, Ruby, PHP, Kotlin and similar languages now show an expandable call tree (up to the configured depth) built by resolving each call site in a method's body via the definition provider. Previously these languages showed a flat navigation-only list. Results are best-effort — cross-file calls across lambda capture boundaries or via dynamic dispatch may not be detected. The view indicates this with a "best-effort" banner.

## [0.2.7-0.2.8] - 2026-03-20

### Improved

- **Call Hierarchy language compatibility**: languages whose servers do not support outgoing call hierarchy (C#, Ruby, PHP, Kotlin) now show a flat navigable method list instead of a blank view, with a message explaining the limitation. Full tree expansion works for TypeScript/JS, Go, Java, Python, and C/C++ (clangd).

### Fixed

- **Fallback method labels garbled for C#**: the flat-list fallback was calling `compactSignature` on `symbol.detail`, but for C# (and similar servers) `detail` contains the class name rather than a parameter list, producing labels like `GetEmployees() : Task<...>EmployeesController`. The fallback now always uses `undefined` as the hint so the label is exactly the method name.

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
