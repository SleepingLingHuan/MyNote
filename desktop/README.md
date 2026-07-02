# MyNote Desktop Runtime

This directory tracks the desktop runtime contract for the future Tauri shell.
The browser app remains the development environment; the desktop app should load
the same built frontend assets and replace only the storage provider.

## Runtime Roles

- Browser runtime: `web/src/storage.js` uses IndexedDB and keeps development fast.
- Desktop runtime: a future Tauri provider should implement the same
  `MyNoteStorage` API and persist data to a real workspace directory.
- Workspace format: `web/src/workspace-format.js` owns the normalized JSON shape
  shared by browser import/export and desktop file-backed storage.

## Desktop Workspace

Use a user-data directory, not the install directory.

```text
MyNoteWorkspace/
  manifest.json
  entries/
  assets/
  index/
```

Recommended default locations:

- macOS: app-local data directory through Tauri `BaseDirectory.AppLocalData`.
- Windows: app-local data directory through Tauri `BaseDirectory.AppLocalData`.
- Browser: IndexedDB plus JSON/Markdown import-export.

## Incremental Frontend Update

Keep shell updates separate from frontend updates:

- Frontend update: replace a local asset bundle under app-local data.
- Shell update: use a signed Tauri app update or a manual installer.

The frontend bundle manifest shape is in
`runtime-update-manifest.example.json`.

## External Dependencies Needed Later

Actual desktop packaging will require manual installation of:

- Rust toolchain.
- Tauri CLI and Tauri JavaScript packages.
- Platform build tools for macOS and Windows.

Do not add those dependencies until the browser-side storage boundary is stable.
