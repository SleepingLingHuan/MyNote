(function () {
  function detectRuntime() {
    if (window.__TAURI_INTERNALS__ || window.__TAURI__) {
      return "tauri";
    }

    return "browser";
  }

  const runtime = detectRuntime();

  window.MyNotePlatform = {
    runtime,
    isBrowser: runtime === "browser",
    isTauri: runtime === "tauri",
    storageProvider: runtime === "tauri" ? "tauri-file-system-pending" : "browser-indexeddb",
    workspaceVersion: 1
  };
})();
