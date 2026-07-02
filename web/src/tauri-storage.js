(function () {
  const platform = window.MyNotePlatform;
  const workspaceFormat = window.MyNoteWorkspaceFormat;

  if (!platform || !platform.isTauri) {
    return;
  }

  function getInvoke() {
    const invoke = window.__TAURI__?.core?.invoke;

    if (typeof invoke !== "function") {
      throw new Error("Tauri API 未就绪，无法访问桌面端本地存储。");
    }

    return invoke;
  }

  let workspace;
  let loadPromise;

  function emptyWorkspace() {
    const now = new Date().toISOString();
    return workspaceFormat.createWorkspace({
      entries: [],
      categories: [
        {
          id: "cat-default",
          name: "未分类",
          color: "#8ba888",
          parentId: null,
          createdAt: now,
          updatedAt: now
        }
      ],
      assets: []
    });
  }

  async function persist() {
    const invoke = getInvoke();
    workspace = workspaceFormat.createWorkspace(workspace);
    await invoke("save_workspace", { workspace });
  }

  async function ensureLoaded() {
    if (workspace) {
      return;
    }

    if (!loadPromise) {
      loadPromise = (async () => {
        const invoke = getInvoke();
        const loaded = await invoke("load_workspace");
        workspace = loaded ? workspaceFormat.normalizeWorkspace(loaded) : emptyWorkspace();
        await persist();
      })();
    }

    await loadPromise;
  }

  async function ensureDefaults() {
    await ensureLoaded();

    if (workspace.categories.length > 0) {
      return;
    }

    workspace = emptyWorkspace();
    await persist();
  }

  function replaceById(list, item) {
    const index = list.findIndex((current) => current.id === item.id);

    if (index === -1) {
      list.push(item);
      return;
    }

    list[index] = item;
  }

  function removeById(list, id) {
    const index = list.findIndex((item) => item.id === id);

    if (index !== -1) {
      list.splice(index, 1);
    }
  }

  const tauriFileStorage = {
    providerId: "tauri-workspace-json",

    async ensureDefaults() {
      await ensureDefaults();
    },

    async getEntries() {
      await ensureLoaded();
      return [...workspace.entries];
    },

    async getEntry(id) {
      await ensureLoaded();
      return workspace.entries.find((entry) => entry.id === id) || null;
    },

    async saveEntry(entry) {
      await ensureLoaded();
      replaceById(workspace.entries, entry);
      await persist();
    },

    async deleteEntry(id) {
      await ensureLoaded();
      removeById(workspace.entries, id);
      await persist();
    },

    async getCategories() {
      await ensureLoaded();
      return [...workspace.categories];
    },

    async saveCategory(category) {
      await ensureLoaded();
      replaceById(workspace.categories, category);
      await persist();
    },

    async deleteCategory(id) {
      await ensureLoaded();
      removeById(workspace.categories, id);
      await persist();
    },

    async getAssets() {
      await ensureLoaded();
      return [...workspace.assets];
    },

    async getAsset(id) {
      await ensureLoaded();
      return workspace.assets.find((asset) => asset.id === id) || null;
    },

    async saveAsset(asset) {
      await ensureLoaded();
      replaceById(workspace.assets, asset);
      await persist();
    },

    async deleteAsset(id) {
      await ensureLoaded();
      removeById(workspace.assets, id);
      await persist();
    },

    async exportWorkspace() {
      await ensureLoaded();
      return workspaceFormat.createWorkspace(workspace);
    },

    async importWorkspace(nextWorkspace) {
      workspace = workspaceFormat.normalizeWorkspace(nextWorkspace);
      await persist();
    }
  };

  window.MyNoteStorage = tauriFileStorage;
  window.MyNoteStorageProvider = tauriFileStorage;
  platform.storageProvider = tauriFileStorage.providerId;
})();
