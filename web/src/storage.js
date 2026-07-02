(function () {
  const DB_NAME = "mynote-local-db";
  const DB_VERSION = 1;
  const STORES = ["entries", "categories", "assets"];

  let dbPromise;

  function openDb() {
    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        STORES.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: "id" });
          }
        });
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return dbPromise;
  }

  async function withStore(storeName, mode, action) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const result = action(store);

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll(storeName) {
    return withStore(storeName, "readonly", (store) => requestToPromise(store.getAll()));
  }

  async function getOne(storeName, id) {
    return withStore(storeName, "readonly", (store) => requestToPromise(store.get(id)));
  }

  async function putOne(storeName, value) {
    return withStore(storeName, "readwrite", (store) => {
      store.put(value);
      return undefined;
    });
  }

  async function deleteOne(storeName, id) {
    return withStore(storeName, "readwrite", (store) => {
      store.delete(id);
      return undefined;
    });
  }

  async function clearStore(storeName) {
    return withStore(storeName, "readwrite", (store) => {
      store.clear();
      return undefined;
    });
  }

  async function ensureDefaults() {
    const categories = await getAll("categories");

    if (categories.length > 0) {
      return;
    }

    const now = new Date().toISOString();
    await putOne("categories", {
      id: "cat-default",
      name: "未分类",
      color: "#8ba888",
      createdAt: now,
      updatedAt: now
    });
  }

  async function exportWorkspace() {
    const [entries, categories, assets] = await Promise.all([
      getAll("entries"),
      getAll("categories"),
      getAll("assets")
    ]);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
      categories,
      assets
    };
  }

  async function importWorkspace(workspace) {
    if (!workspace || !Array.isArray(workspace.entries) || !Array.isArray(workspace.categories)) {
      throw new Error("导入文件不是有效的 MyNote 工作区。");
    }

    await Promise.all(STORES.map(clearStore));

    for (const category of workspace.categories) {
      await putOne("categories", category);
    }

    for (const entry of workspace.entries) {
      await putOne("entries", entry);
    }

    for (const asset of workspace.assets || []) {
      await putOne("assets", asset);
    }

    await ensureDefaults();
  }

  window.MyNoteStorage = {
    ensureDefaults,
    getEntries: () => getAll("entries"),
    getEntry: (id) => getOne("entries", id),
    saveEntry: (entry) => putOne("entries", entry),
    deleteEntry: (id) => deleteOne("entries", id),
    getCategories: () => getAll("categories"),
    saveCategory: (category) => putOne("categories", category),
    deleteCategory: (id) => deleteOne("categories", id),
    getAssets: () => getAll("assets"),
    getAsset: (id) => getOne("assets", id),
    saveAsset: (asset) => putOne("assets", asset),
    deleteAsset: (id) => deleteOne("assets", id),
    exportWorkspace,
    importWorkspace
  };
})();
