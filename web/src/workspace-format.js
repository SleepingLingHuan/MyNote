(function () {
  const WORKSPACE_VERSION = 1;

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeCategory(category, fallbackDate) {
    return {
      id: category.id,
      name: category.name || "未分类",
      color: category.color || "#8ba888",
      parentId: category.parentId || null,
      createdAt: category.createdAt || category.updatedAt || fallbackDate,
      updatedAt: category.updatedAt || category.createdAt || fallbackDate
    };
  }

  function normalizeEntry(entry, fallbackCategoryId, fallbackDate) {
    return {
      id: entry.id,
      title: entry.title || "未命名文章",
      categoryId: entry.categoryId || fallbackCategoryId,
      contentMarkdown: entry.contentMarkdown || "",
      excerpt: entry.excerpt || "",
      assetIds: entry.assetIds || [],
      createdAt: entry.createdAt || entry.updatedAt || fallbackDate,
      updatedAt: entry.updatedAt || entry.createdAt || fallbackDate,
      savedAt: entry.savedAt || entry.updatedAt || entry.createdAt || fallbackDate
    };
  }

  function normalizeAsset(asset, fallbackDate) {
    return {
      ...asset,
      createdAt: asset.createdAt || fallbackDate
    };
  }

  function normalizeWorkspace(workspace) {
    if (!workspace || !Array.isArray(workspace.entries) || !Array.isArray(workspace.categories)) {
      throw new Error("导入文件不是有效的 MyNote 工作区。");
    }

    const fallbackDate = nowIso();
    const categories = workspace.categories.map((category) => normalizeCategory(category, fallbackDate));
    const fallbackCategoryId = categories[0]?.id || "cat-default";

    return {
      version: workspace.version || WORKSPACE_VERSION,
      exportedAt: workspace.exportedAt || fallbackDate,
      entries: workspace.entries.map((entry) => normalizeEntry(entry, fallbackCategoryId, fallbackDate)),
      categories,
      assets: (workspace.assets || []).map((asset) => normalizeAsset(asset, fallbackDate))
    };
  }

  function createWorkspace({ entries, categories, assets }) {
    return normalizeWorkspace({
      version: WORKSPACE_VERSION,
      exportedAt: nowIso(),
      entries,
      categories,
      assets
    });
  }

  window.MyNoteWorkspaceFormat = {
    WORKSPACE_VERSION,
    createWorkspace,
    normalizeWorkspace
  };
})();
