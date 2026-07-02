(function () {
  const storage = window.MyNoteStorage;
  const markdown = window.MyNoteMarkdown;
  const state = {
    entries: [],
    categories: [],
    assets: [],
    selectedEntryId: null,
    selectedCategoryId: "all",
    importTargetCategoryId: null,
    searchQuery: "",
    mode: "edit",
    theme: localStorage.getItem("mynote-theme") || "light",
    isEntryPanelCollapsed: localStorage.getItem("mynote-entry-panel-collapsed") === "true",
    saveTimer: null,
    statusTimer: null
  };

  const nodes = {
    allCount: document.getElementById("all-count"),
    newCategoryButton: document.getElementById("new-category-button"),
    themeToggleButton: document.getElementById("theme-toggle-button"),
    categoryNav: document.querySelector(".category-nav"),
    categoryList: document.getElementById("category-list"),
    entryList: document.getElementById("entry-list"),
    entryPanelTitle: document.getElementById("entry-panel-title"),
    newEntryListButton: document.getElementById("new-entry-list-button"),
    entryPanelToggle: document.getElementById("entry-panel-toggle"),
    searchInput: document.getElementById("search-input"),
    emptyState: document.getElementById("empty-state"),
    emptyNewEntryButton: document.getElementById("empty-new-entry-button"),
    editorView: document.getElementById("editor-view"),
    titleInput: document.getElementById("title-input"),
    saveStatus: document.getElementById("save-status"),
    createdAtText: document.getElementById("created-at-text"),
    savedAtText: document.getElementById("saved-at-text"),
    contentInput: document.getElementById("content-input"),
    preview: document.getElementById("preview"),
    editorGrid: document.getElementById("editor-grid"),
    imageInput: document.getElementById("image-input"),
    importInput: document.getElementById("import-input"),
    modeToggleButton: document.getElementById("mode-toggle-button"),
    newEntryDialog: document.getElementById("new-entry-dialog"),
    newEntryForm: document.getElementById("new-entry-form"),
    newEntryTitleInput: document.getElementById("new-entry-title-input"),
    newEntryCategorySelect: document.getElementById("new-entry-category-select"),
    cancelNewEntryButton: document.getElementById("cancel-new-entry-button"),
    appDialog: document.getElementById("app-dialog"),
    appDialogForm: document.getElementById("app-dialog-form"),
    appDialogEyebrow: document.getElementById("app-dialog-eyebrow"),
    appDialogTitle: document.getElementById("app-dialog-title"),
    appDialogMessage: document.getElementById("app-dialog-message"),
    appDialogField: document.getElementById("app-dialog-field"),
    appDialogFieldLabel: document.getElementById("app-dialog-field-label"),
    appDialogInput: document.getElementById("app-dialog-input"),
    appDialogSelectField: document.getElementById("app-dialog-select-field"),
    appDialogSelectLabel: document.getElementById("app-dialog-select-label"),
    appDialogSelect: document.getElementById("app-dialog-select"),
    appDialogCancel: document.getElementById("app-dialog-cancel"),
    appDialogConfirm: document.getElementById("app-dialog-confirm")
  };

  function validateNodes() {
    const missing = Object.entries(nodes)
      .filter(([, node]) => !node)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`页面结构和脚本不匹配，缺少节点：${missing.join(", ")}`);
    }
  }

  function createId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }

    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function formatDateTime(value) {
    if (!value) {
      return "--";
    }

    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function getSelectedEntry() {
    return state.entries.find((entry) => entry.id === state.selectedEntryId) || null;
  }

  function getCategoryName(categoryId) {
    return state.categories.find((category) => category.id === categoryId)?.name || "未分类";
  }

  function getDescendantCategoryIds(categoryId) {
    const result = [];
    const visit = (parentId) => {
      state.categories
        .filter((category) => category.parentId === parentId)
        .forEach((category) => {
          result.push(category.id);
          visit(category.id);
        });
    };

    visit(categoryId);
    return result;
  }

  function getVisibleCategoryIds(categoryId) {
    if (categoryId === "all") {
      return null;
    }

    return new Set([categoryId, ...getDescendantCategoryIds(categoryId)]);
  }

  function getCategoryRows() {
    const rows = [];
    const sorted = [...state.categories].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));

    function append(parentId, depth) {
      sorted
        .filter((category) => (category.parentId || null) === parentId)
        .forEach((category) => {
          rows.push({ category, depth });
          append(category.id, depth + 1);
        });
    }

    append(null, 0);
    return rows;
  }

  function getCategoryOptions() {
    return getCategoryRows().map(({ category, depth }) => ({
      category,
      label: `${"  ".repeat(depth)}${depth > 0 ? "└ " : ""}${category.name}`
    }));
  }

  function getFilteredEntries() {
    const query = state.searchQuery.trim().toLowerCase();
    const visibleCategoryIds = getVisibleCategoryIds(state.selectedCategoryId);

    return state.entries
      .filter((entry) => !visibleCategoryIds || visibleCategoryIds.has(entry.categoryId))
      .filter((entry) => {
        if (!query) {
          return true;
        }

        return [entry.title, entry.excerpt, markdown.toPlainText(entry.contentMarkdown)]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async function loadState() {
    await storage.ensureDefaults();
    const [entries, categories, assets] = await Promise.all([
      storage.getEntries(),
      storage.getCategories(),
      storage.getAssets()
    ]);

    const now = nowIso();
    state.entries = entries.map((entry) => ({
      id: entry.id || createId("entry"),
      title: entry.title || "未命名文章",
      categoryId: entry.categoryId || categories[0]?.id || "cat-default",
      contentMarkdown: entry.contentMarkdown || "",
      excerpt: entry.excerpt || markdown.toPlainText(entry.contentMarkdown || "").slice(0, 120),
      assetIds: entry.assetIds || [],
      createdAt: entry.createdAt || entry.updatedAt || now,
      updatedAt: entry.updatedAt || entry.createdAt || now,
      savedAt: entry.savedAt || entry.updatedAt || entry.createdAt || now
    }));
    state.categories = categories
      .map((category) => ({
        id: category.id || createId("cat"),
        name: category.name || "未分类",
        color: category.color || "#8ba888",
        parentId: category.parentId || null,
        createdAt: category.createdAt || category.updatedAt || now,
        updatedAt: category.updatedAt || category.createdAt || now
      }))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    state.assets = assets.map((asset) => ({
      ...asset,
      id: asset.id || createId("asset"),
      createdAt: asset.createdAt || now
    }));

    if (!state.selectedEntryId && state.entries.length > 0) {
      state.selectedEntryId = getFilteredEntries()[0]?.id || state.entries[0].id;
    }
  }

  function renderCategories() {
    nodes.allCount.textContent = String(state.entries.length);
    nodes.categoryList.innerHTML = "";
    document.querySelector('[data-category-filter="all"]').classList.toggle("active", state.selectedCategoryId === "all");

    getCategoryRows().forEach(({ category, depth }) => {
      const visibleIds = getVisibleCategoryIds(category.id);
      const count = state.entries.filter((entry) => visibleIds.has(entry.categoryId)).length;
      const card = document.createElement("article");
      card.className = `category-item${state.selectedCategoryId === category.id ? " active" : ""}`;
      card.dataset.categoryFilter = category.id;
      card.style.setProperty("--category-depth", depth);
      card.innerHTML = `
        <button class="category-main" type="button" data-category-open style="padding-left:${10 + depth * 14}px">
          <span class="category-dot" style="background:${category.color}"></span>
          <span>${escapeText(category.name)}</span>
          <span class="count">${count}</span>
        </button>
        <div class="category-actions">
          <button class="category-menu-button" type="button" data-category-menu aria-label="分类操作">...</button>
          <div class="category-action-menu" role="menu">
            <button type="button" data-category-action="create-entry">新建文章</button>
            <button type="button" data-category-action="rename">重命名</button>
            <button type="button" data-category-action="create-child">创建子分类</button>
            <button type="button" data-category-action="import">导入到此分类</button>
            <button class="danger" type="button" data-category-action="delete">删除</button>
          </div>
        </div>
      `;
      nodes.categoryList.appendChild(card);
    });

    nodes.newEntryCategorySelect.innerHTML = getCategoryOptions()
      .map(({ category, label }) => `<option value="${category.id}">${escapeText(label)}</option>`)
      .join("");
  }

  function renderEntryList() {
    const entries = getFilteredEntries();
    nodes.entryList.innerHTML = "";
    nodes.entryPanelTitle.textContent = state.selectedCategoryId === "all"
      ? "全部文章"
      : getCategoryName(state.selectedCategoryId);

    if (entries.length === 0) {
      nodes.entryList.innerHTML = '<div class="empty-list">没有匹配的文章</div>';
      return;
    }

    entries.forEach((entry) => {
      const card = document.createElement("article");
      card.className = `entry-card${entry.id === state.selectedEntryId ? " active" : ""}`;
      card.dataset.entryId = entry.id;
      card.innerHTML = `
        <button class="entry-card-main" type="button" data-entry-open>
          <span class="entry-card-title">${escapeText(entry.title || "未命名文章")}</span>
          <span class="entry-card-excerpt">${escapeText(entry.excerpt || "还没有内容")}</span>
          <span class="entry-card-meta">
            <span>${escapeText(getCategoryName(entry.categoryId))}</span>
            <span>${formatDate(entry.savedAt || entry.updatedAt || entry.createdAt)}</span>
          </span>
        </button>
        <div class="entry-actions">
          <button class="entry-menu-button" type="button" data-entry-menu aria-label="文章操作">...</button>
          <div class="entry-action-menu" role="menu">
            <button type="button" data-entry-action="rename">重命名</button>
            <button type="button" data-entry-action="category">修改类别</button>
            <button type="button" data-entry-action="export">导出</button>
            <button class="danger" type="button" data-entry-action="delete">删除</button>
          </div>
        </div>
      `;
      nodes.entryList.appendChild(card);
    });
  }

  function renderEditor() {
    const entry = getSelectedEntry();

    nodes.emptyState.classList.toggle("hidden", Boolean(entry));
    nodes.editorView.classList.toggle("hidden", !entry);

    if (!entry) {
      return;
    }

    nodes.titleInput.value = entry.title;
    nodes.createdAtText.textContent = `创建：${formatDateTime(entry.createdAt)}`;
    nodes.savedAtText.textContent = `最近保存：${formatDateTime(entry.savedAt || entry.updatedAt)}`;
    nodes.contentInput.value = entry.contentMarkdown;
    renderPreview();
  }

  function renderPreview() {
    const entry = getSelectedEntry();
    const assets = entry
      ? state.assets.filter((asset) => asset.entryId === entry.id)
      : [];

    nodes.preview.innerHTML = markdown.renderMarkdown(nodes.contentInput.value, assets);
  }

  function renderMode() {
    nodes.editorGrid.classList.remove("edit-mode", "preview-mode");
    nodes.editorGrid.classList.add(`${state.mode}-mode`);
    nodes.modeToggleButton.textContent = state.mode === "edit" ? "◧" : "</>";
    nodes.modeToggleButton.title = state.mode === "edit" ? "切换到预览" : "切换到编辑";
    nodes.modeToggleButton.setAttribute("aria-label", nodes.modeToggleButton.title);
  }

  function renderTheme() {
    document.body.dataset.theme = state.theme;
    const isDark = state.theme === "dark";
    nodes.themeToggleButton.textContent = "◐";
    nodes.themeToggleButton.title = isDark ? "切换浅色主题" : "切换深色主题";
    nodes.themeToggleButton.setAttribute("aria-label", nodes.themeToggleButton.title);
  }

  function renderEntryPanelState() {
    const workspace = document.querySelector(".workspace");
    workspace.classList.toggle("entry-list-collapsed", state.isEntryPanelCollapsed);
    nodes.entryPanelToggle.textContent = state.isEntryPanelCollapsed ? "›" : "‹";
    nodes.entryPanelToggle.setAttribute(
      "aria-label",
      state.isEntryPanelCollapsed ? "展开文章列表" : "收起文章列表"
    );
    nodes.entryPanelToggle.title = state.isEntryPanelCollapsed ? "展开文章列表" : "收起文章列表";
  }

  function render() {
    renderCategories();
    renderEntryList();
    renderEditor();
    renderMode();
    renderTheme();
    renderEntryPanelState();
  }

  function escapeText(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function updateSelectedEntry(patch) {
    const index = state.entries.findIndex((entry) => entry.id === state.selectedEntryId);

    if (index === -1) {
      return null;
    }

    const current = state.entries[index];
    const updated = {
      ...current,
      ...patch,
      excerpt: markdown.toPlainText(patch.contentMarkdown ?? current.contentMarkdown).slice(0, 120),
      updatedAt: nowIso()
    };

    state.entries[index] = updated;
    return updated;
  }

  function updateEntryById(entryId, patch) {
    const index = state.entries.findIndex((entry) => entry.id === entryId);

    if (index === -1) {
      return null;
    }

    const current = state.entries[index];
    const updated = {
      ...current,
      ...patch,
      excerpt: markdown.toPlainText(patch.contentMarkdown ?? current.contentMarkdown).slice(0, 120),
      updatedAt: nowIso(),
      savedAt: nowIso()
    };

    state.entries[index] = updated;
    return updated;
  }

  function setSaveStatus(text, isError) {
    nodes.saveStatus.textContent = "✓";
    nodes.saveStatus.classList.toggle("error", Boolean(isError));
    nodes.saveStatus.classList.toggle("pending", !isError && text !== "已保存" && text !== "保存成功");
    nodes.saveStatus.classList.toggle("saved", !isError && (text === "已保存" || text === "保存成功"));
    nodes.saveStatus.title = text;
    nodes.saveStatus.setAttribute("aria-label", text);
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      return;
    }

    dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") {
      dialog.close();
      return;
    }

    dialog.removeAttribute("open");
  }

  function showAppDialog(options) {
    return new Promise((resolve) => {
      const needsInput = options.type === "prompt";
      const needsSelect = options.type === "select";
      const hasMessage = Boolean(options.message);

      nodes.appDialogEyebrow.textContent = options.eyebrow || "Notice";
      nodes.appDialogTitle.textContent = options.title || "提示";
      nodes.appDialogMessage.textContent = options.message || "";
      nodes.appDialogMessage.classList.toggle("hidden", !hasMessage);
      nodes.appDialogField.classList.toggle("hidden", !needsInput);
      nodes.appDialogSelectField.classList.toggle("hidden", !needsSelect);
      nodes.appDialogFieldLabel.textContent = options.inputLabel || "输入内容";
      nodes.appDialogInput.value = options.defaultValue || "";
      nodes.appDialogInput.placeholder = options.placeholder || "";
      nodes.appDialogInput.required = needsInput;
      nodes.appDialogInput.disabled = !needsInput;
      nodes.appDialogSelectLabel.textContent = options.selectLabel || "选择一项";
      nodes.appDialogSelect.innerHTML = (options.options || [])
        .map((option) => `<option value="${escapeText(option.value)}">${escapeText(option.label)}</option>`)
        .join("");
      nodes.appDialogSelect.value = options.defaultValue || "";
      nodes.appDialogSelect.required = needsSelect;
      nodes.appDialogSelect.disabled = !needsSelect;
      nodes.appDialogCancel.textContent = options.cancelText || "取消";
      nodes.appDialogConfirm.textContent = options.confirmText || "确认";
      nodes.appDialogCancel.classList.toggle("hidden", options.type === "alert");

      function cleanup() {
        nodes.appDialogForm.removeEventListener("submit", handleSubmit);
        nodes.appDialogCancel.removeEventListener("click", handleCancel);
        nodes.appDialog.removeEventListener("cancel", handleCancel);
      }

      function finish(value) {
        cleanup();
        closeDialog(nodes.appDialog);
        resolve(value);
      }

      function handleSubmit(event) {
        event.preventDefault();

        if (needsInput) {
          const value = nodes.appDialogInput.value.trim();
          if (!value) {
            nodes.appDialogInput.focus();
            return;
          }
          finish(value);
          return;
        }

        if (needsSelect) {
          finish(nodes.appDialogSelect.value);
          return;
        }

        finish(true);
      }

      function handleCancel(event) {
        event.preventDefault();
        finish(needsInput || needsSelect ? null : false);
      }

      nodes.appDialogForm.addEventListener("submit", handleSubmit);
      nodes.appDialogCancel.addEventListener("click", handleCancel);
      nodes.appDialog.addEventListener("cancel", handleCancel);

      openDialog(nodes.appDialog);

      if (needsInput) {
        nodes.appDialogInput.focus();
        nodes.appDialogInput.select();
      } else if (needsSelect) {
        nodes.appDialogSelect.focus();
      } else {
        nodes.appDialogConfirm.focus();
      }
    });
  }

  function showMessage(title, message) {
    return showAppDialog({
      type: "alert",
      eyebrow: "提示",
      title,
      message,
      confirmText: "知道了"
    });
  }

  function showConfirm(title, message, options = {}) {
    return showAppDialog({
      type: "confirm",
      eyebrow: options.eyebrow || "确认操作",
      title,
      message,
      confirmText: options.confirmText || "确认",
      cancelText: options.cancelText || "取消"
    });
  }

  function showTextPrompt(title, options = {}) {
    return showAppDialog({
      type: "prompt",
      eyebrow: options.eyebrow || "Input",
      title,
      message: options.message || "",
      inputLabel: options.inputLabel || "输入内容",
      placeholder: options.placeholder || "",
      defaultValue: options.defaultValue || "",
      confirmText: options.confirmText || "确认",
      cancelText: "取消"
    });
  }

  function showSelectPrompt(title, options = {}) {
    return showAppDialog({
      type: "select",
      eyebrow: options.eyebrow || "Select",
      title,
      message: options.message || "",
      selectLabel: options.selectLabel || "选择一项",
      options: options.options || [],
      defaultValue: options.defaultValue || "",
      confirmText: options.confirmText || "确认",
      cancelText: "取消"
    });
  }

  function getEditorPatch() {
    return {
      title: nodes.titleInput.value.trim() || "未命名文章",
      contentMarkdown: nodes.contentInput.value
    };
  }

  async function saveSelectedEntry(options = {}) {
    const updated = updateSelectedEntry({
      ...getEditorPatch(),
      savedAt: nowIso()
    });

    if (!updated) {
      return null;
    }

    try {
      await storage.saveEntry(updated);
      setSaveStatus(options.manual ? "保存成功" : "已保存", false);
      nodes.savedAtText.textContent = `最近保存：${formatDateTime(updated.savedAt)}`;
      renderEntryList();
      renderCategories();

      if (options.manual) {
        window.clearTimeout(state.statusTimer);
        state.statusTimer = window.setTimeout(() => setSaveStatus("已保存", false), 1400);
      }

      return updated;
    } catch (error) {
      setSaveStatus("保存失败", true);
      console.error(error);
      return null;
    }
  }

  function scheduleSave() {
    updateSelectedEntry(getEditorPatch());

    setSaveStatus("保存中", false);
    window.clearTimeout(state.saveTimer);

    state.saveTimer = window.setTimeout(async () => {
      await saveSelectedEntry();
    }, 420);
  }

  function openNewEntryDialog(defaultCategoryId) {
    const categoryId = defaultCategoryId
      || (state.selectedCategoryId !== "all"
      ? state.selectedCategoryId
      : state.categories[0]?.id);

    if (!categoryId) {
      return;
    }

    nodes.newEntryTitleInput.value = "";
    nodes.newEntryCategorySelect.value = categoryId;

    openDialog(nodes.newEntryDialog);
    nodes.newEntryTitleInput.focus();
  }

  async function createEntry(title, categoryId) {
    const now = nowIso();
    const entry = {
      id: createId("entry"),
      title: title.trim(),
      categoryId,
      contentMarkdown: "",
      excerpt: "",
      assetIds: [],
      createdAt: now,
      updatedAt: now,
      savedAt: now
    };

    state.entries.unshift(entry);
    state.selectedEntryId = entry.id;
    await storage.saveEntry(entry);
    render();
    nodes.titleInput.focus();
    nodes.titleInput.select();
  }

  async function submitNewEntry(event) {
    event.preventDefault();
    const title = nodes.newEntryTitleInput.value.trim();
    const categoryId = nodes.newEntryCategorySelect.value;

    if (!title || !categoryId) {
      return;
    }

    closeDialog(nodes.newEntryDialog);
    await createEntry(title, categoryId);
  }

  async function createCategory(parentId = null) {
    const parentCategory = parentId
      ? state.categories.find((category) => category.id === parentId)
      : null;
    const name = await showTextPrompt(parentCategory ? "创建子分类" : "新建分类", {
      eyebrow: "分类管理",
      message: parentCategory
        ? `将在“${parentCategory.name}”下创建一个子分类。`
        : "分类用于按主题筛选文章；每篇文章只能归属一个分类。",
      inputLabel: parentCategory ? "子分类名称" : "分类名称",
      placeholder: parentCategory ? "例如：读书笔记" : "例如：学习",
      confirmText: "创建"
    });

    if (!name) {
      return;
    }

    const colors = ["#8ba888", "#c9828f", "#c39a56", "#7f9fbf", "#a58bb8"];
    const now = nowIso();
    const category = {
      id: createId("cat"),
      name,
      parentId,
      color: colors[state.categories.length % colors.length],
      createdAt: now,
      updatedAt: now
    };

    state.categories.push(category);
    await storage.saveCategory(category);
    render();
  }

  async function deleteCategory(categoryId) {
    const category = state.categories.find((item) => item.id === categoryId);

    if (!category) {
      return;
    }

    const hasChildren = state.categories.some((item) => item.parentId === category.id);
    const hasEntries = state.entries.some((entry) => entry.categoryId === category.id);

    if (hasChildren || hasEntries) {
      await showMessage(
        "无法删除分类",
        `“${category.name}”下仍有${hasChildren ? "子分类" : ""}${hasChildren && hasEntries ? "和" : ""}${hasEntries ? "文章" : ""}。请先移动或删除这些内容。`
      );
      return;
    }

    const confirmed = await showConfirm(
      "删除分类",
      `删除分类“${category.name}”？此操作不会影响其他分类。`,
      {
        eyebrow: "危险操作",
        confirmText: "删除",
        cancelText: "保留"
      }
    );

    if (!confirmed) {
      return;
    }

    state.categories = state.categories.filter((item) => item.id !== category.id);
    await storage.deleteCategory(category.id);

    if (state.selectedCategoryId === category.id) {
      state.selectedCategoryId = "all";
    }

    render();
  }

  async function renameCategory(categoryId) {
    const category = state.categories.find((item) => item.id === categoryId);

    if (!category) {
      return;
    }

    const name = await showTextPrompt("重命名分类", {
      eyebrow: "分类管理",
      message: `当前分类：${category.name}`,
      inputLabel: "新的分类名称",
      defaultValue: category.name,
      confirmText: "保存"
    });

    if (!name || name === category.name) {
      return;
    }

    const updated = {
      ...category,
      name,
      updatedAt: nowIso()
    };
    const index = state.categories.findIndex((item) => item.id === category.id);
    state.categories[index] = updated;
    await storage.saveCategory(updated);
    render();
  }

  async function renameEntry(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);

    if (!entry) {
      return;
    }

    const title = await showTextPrompt("重命名文章", {
      eyebrow: "文章信息",
      message: "修改文章名称后，会同步更新文章列表和编辑器标题。",
      inputLabel: "新的文章名称",
      defaultValue: entry.title || "未命名文章",
      confirmText: "保存"
    });

    if (!title || title === entry.title) {
      return;
    }

    const updated = updateEntryById(entry.id, { title });

    if (!updated) {
      return;
    }

    await storage.saveEntry(updated);

    if (state.selectedEntryId === entry.id) {
      nodes.titleInput.value = updated.title;
      nodes.savedAtText.textContent = `最近保存：${formatDateTime(updated.savedAt)}`;
    }

    renderEntryList();
  }

  async function changeEntryCategory(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);

    if (!entry) {
      return;
    }

    const categoryId = await showSelectPrompt("修改类别", {
      eyebrow: "文章信息",
      message: `为《${entry.title || "未命名文章"}》选择一个新的分类。`,
      selectLabel: "文章分类",
      options: state.categories.map((category) => ({
        value: category.id,
        label: category.name
      })),
      defaultValue: entry.categoryId,
      confirmText: "保存"
    });

    if (!categoryId || categoryId === entry.categoryId) {
      return;
    }

    const updated = updateEntryById(entry.id, { categoryId });

    if (!updated) {
      return;
    }

    await storage.saveEntry(updated);

    if (state.selectedEntryId === entry.id) {
      nodes.savedAtText.textContent = `最近保存：${formatDateTime(updated.savedAt)}`;
    }

    renderCategories();
    renderEntryList();
  }

  async function deleteEntry(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);

    if (!entry) {
      return;
    }

    const title = entry.title || "未命名文章";
    const confirmed = await showConfirm(
      "删除文章",
      `删除《${title}》？此操作只会删除本地浏览器中的这篇文章。`,
      {
        eyebrow: "危险操作",
        confirmText: "删除",
        cancelText: "保留"
      }
    );

    if (!confirmed) {
      return;
    }

    window.clearTimeout(state.saveTimer);
    window.clearTimeout(state.statusTimer);
    const assetIds = new Set(entry.assetIds || []);
    const deleteAssetPromises = [];
    state.entries = state.entries.filter((item) => item.id !== entry.id);
    state.assets = state.assets.filter((asset) => {
      if (asset.entryId === entry.id || assetIds.has(asset.id)) {
        deleteAssetPromises.push(storage.deleteAsset(asset.id));
        return false;
      }

      return true;
    });

    await Promise.all([storage.deleteEntry(entry.id), ...deleteAssetPromises]);
    const nextEntry = getFilteredEntries()[0] || state.entries[0] || null;
    state.selectedEntryId = nextEntry?.id || null;
    render();
  }

  async function deleteSelectedEntry() {
    await deleteEntry(state.selectedEntryId);
  }

  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
    textarea.selectionStart = start + text.length;
    textarea.selectionEnd = start + text.length;
    textarea.focus();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function addImage(file) {
    const entry = getSelectedEntry();

    if (!entry || !file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      await showMessage("无法插入文件", "当前文件不是图片。请拖入或选择 PNG、JPG、GIF、WebP 等图片文件。");
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    const now = nowIso();
    const asset = {
      id: createId("asset"),
      entryId: entry.id,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      dataUrl,
      createdAt: now
    };

    state.assets.push(asset);
    await storage.saveAsset(asset);
    entry.assetIds = Array.from(new Set([...(entry.assetIds || []), asset.id]));
    insertAtCursor(nodes.contentInput, `\n![${file.name}](asset:${asset.id})\n`);
    renderPreview();
    scheduleSave();
  }

  async function exportData() {
    const workspace = await storage.exportWorkspace();
    const date = new Date().toISOString().slice(0, 10);
    const format = await showSelectPrompt("导出工作区", {
      eyebrow: "工作区导出",
      message: "JSON 会保留完整数据和图片资产；Markdown 会导出所有文章正文，适合阅读和迁移文本。",
      selectLabel: "导出格式",
      options: [
        { value: "json", label: "JSON（完整备份）" },
        { value: "markdown", label: "Markdown（所有文章文本）" }
      ],
      defaultValue: "json",
      confirmText: "导出"
    });

    if (!format) {
      return;
    }

    if (format === "markdown") {
      const content = workspace.entries
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((entry) => entryToMarkdown(entry))
        .join("\n\n---\n\n");
      downloadText(`mynote-workspace-${date}.md`, content, "text/markdown");
      return;
    }

    downloadJson(`mynote-workspace-${date}.json`, workspace);
  }

  function downloadJson(fileName, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadText(fileName, text, type = "text/plain") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function sanitizeFileName(value) {
    return String(value || "entry")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 80);
  }

  function entryToMarkdown(entry) {
    const category = getCategoryName(entry.categoryId);
    const frontMatter = [
      "---",
      `title: ${entry.title || "未命名文章"}`,
      `category: ${category}`,
      `createdAt: ${entry.createdAt || ""}`,
      `savedAt: ${entry.savedAt || entry.updatedAt || ""}`,
      "---",
      ""
    ].join("\n");

    return `${frontMatter}${entry.contentMarkdown || ""}`;
  }

  function parseMarkdownImport(text, fileName, targetCategoryId) {
    const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
    const metadata = {};
    let body = text;

    if (match) {
      body = match[2];
      match[1].split("\n").forEach((line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex === -1) {
          return;
        }
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        metadata[key] = value;
      });
    }

    const now = nowIso();
    const title = metadata.title || fileName.replace(/\.(md|markdown)$/i, "") || "导入文章";

    return {
      id: createId("entry"),
      title,
      categoryId: targetCategoryId || state.categories[0]?.id,
      contentMarkdown: body.trim(),
      excerpt: markdown.toPlainText(body).slice(0, 120),
      assetIds: [],
      createdAt: metadata.createdAt || now,
      updatedAt: now,
      savedAt: now
    };
  }

  async function exportEntry(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);

    if (!entry) {
      return;
    }

    if (entry.id === state.selectedEntryId) {
      window.clearTimeout(state.saveTimer);
      await saveSelectedEntry();
    }

    const latestEntry = state.entries.find((item) => item.id === entryId) || entry;
    const assetIds = new Set(latestEntry.assetIds || []);
    const assets = state.assets.filter((asset) => asset.entryId === latestEntry.id || assetIds.has(asset.id));
    const category = state.categories.find((item) => item.id === latestEntry.categoryId) || null;
    const exportedAt = new Date().toISOString();

    const format = await showSelectPrompt("导出文章", {
      eyebrow: "文章导出",
      message: `选择《${latestEntry.title || "未命名文章"}》的导出格式。JSON 会包含图片资产，Markdown 更适合普通文本迁移。`,
      selectLabel: "导出格式",
      options: [
        { value: "json", label: "JSON（包含文章数据和图片资产）" },
        { value: "markdown", label: "Markdown（.md 文本）" }
      ],
      defaultValue: "json",
      confirmText: "导出"
    });

    if (!format) {
      return;
    }

    if (format === "markdown") {
      downloadText(
        `${sanitizeFileName(latestEntry.title)}-${exportedAt.slice(0, 10)}.md`,
        entryToMarkdown(latestEntry),
        "text/markdown"
      );
      return;
    }

    downloadJson(`${sanitizeFileName(latestEntry.title)}-${exportedAt.slice(0, 10)}.json`, {
      version: 1,
      type: "mynote-entry",
      exportedAt,
      entry: latestEntry,
      category,
      assets
    });
  }

  function remapImportedEntry(entry, targetCategoryId) {
    const newEntryId = createId("entry");
    const assetIdMap = new Map();
    const assetIds = entry.assetIds || [];

    assetIds.forEach((assetId) => {
      assetIdMap.set(assetId, createId("asset"));
    });

    let contentMarkdown = entry.contentMarkdown || "";
    assetIdMap.forEach((newAssetId, oldAssetId) => {
      contentMarkdown = contentMarkdown.replaceAll(`asset:${oldAssetId}`, `asset:${newAssetId}`);
    });

    const now = nowIso();
    return {
      entry: {
        ...entry,
        id: newEntryId,
        categoryId: targetCategoryId,
        contentMarkdown,
        assetIds: Array.from(assetIdMap.values()),
        createdAt: entry.createdAt || now,
        updatedAt: now,
        savedAt: now
      },
      assetIdMap
    };
  }

  async function importIntoCategory(workspace, targetCategoryId) {
    const importedEntries = workspace.type === "mynote-entry"
      ? [workspace.entry]
      : workspace.entries;

    if (!Array.isArray(importedEntries) || importedEntries.length === 0) {
      throw new Error("导入文件中没有可导入的文章。");
    }

    const importedAssets = workspace.type === "mynote-entry"
      ? workspace.assets || []
      : workspace.assets || [];
    const allAssetIdMaps = new Map();
    const entriesToSave = importedEntries.map((entry) => {
      const result = remapImportedEntry(entry, targetCategoryId);
      result.assetIdMap.forEach((newId, oldId) => allAssetIdMaps.set(oldId, { newId, entryId: result.entry.id }));
      return result.entry;
    });
    const assetsToSave = importedAssets
      .filter((asset) => allAssetIdMaps.has(asset.id))
      .map((asset) => {
        const mapped = allAssetIdMaps.get(asset.id);
        return {
          ...asset,
          id: mapped.newId,
          entryId: mapped.entryId
        };
      });

    for (const entry of entriesToSave) {
      await storage.saveEntry(entry);
      state.entries.push(entry);
    }

    for (const asset of assetsToSave) {
      await storage.saveAsset(asset);
      state.assets.push(asset);
    }

    state.selectedCategoryId = targetCategoryId;
    state.selectedEntryId = entriesToSave[0].id;
    render();
  }

  async function importData(file, targetCategoryId = null) {
    if (!file) {
      return;
    }

    const text = await file.text();
    const isMarkdownFile = /\.(md|markdown)$/i.test(file.name) || file.type === "text/markdown";

    if (isMarkdownFile) {
      const categoryId = targetCategoryId || state.categories[0]?.id;

      if (!categoryId) {
        throw new Error("导入 Markdown 前需要先创建一个分类。");
      }

      const entry = parseMarkdownImport(text, file.name, categoryId);
      await storage.saveEntry(entry);
      state.entries.push(entry);
      state.selectedCategoryId = categoryId;
      state.selectedEntryId = entry.id;
      render();
      return;
    }

    let workspace;

    try {
      workspace = JSON.parse(text);
    } catch (error) {
      throw new Error("导入文件不是有效的 JSON。");
    }

    if (targetCategoryId) {
      await importIntoCategory(workspace, targetCategoryId);
      return;
    }

    if (!Array.isArray(workspace.entries) || !Array.isArray(workspace.categories)) {
      throw new Error("导入文件不是有效的 MyNote 工作区。");
    }

    await storage.importWorkspace(workspace);
    state.selectedEntryId = null;
    state.selectedCategoryId = "all";
    state.searchQuery = "";
    nodes.searchInput.value = "";
    await loadState();
    render();
  }

  function bindEvents() {
    nodes.newCategoryButton.addEventListener("click", () => createCategory());
    nodes.themeToggleButton.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("mynote-theme", state.theme);
      renderTheme();
    });
    nodes.newEntryListButton.addEventListener("click", () => openNewEntryDialog());
    nodes.emptyNewEntryButton.addEventListener("click", () => openNewEntryDialog());
    nodes.entryPanelToggle.addEventListener("click", () => {
      state.isEntryPanelCollapsed = !state.isEntryPanelCollapsed;
      localStorage.setItem("mynote-entry-panel-collapsed", String(state.isEntryPanelCollapsed));
      renderEntryPanelState();
    });
    nodes.modeToggleButton.addEventListener("click", () => {
      state.mode = state.mode === "edit" ? "preview" : "edit";
      renderMode();
    });
    nodes.newEntryForm.addEventListener("submit", submitNewEntry);
    nodes.cancelNewEntryButton.addEventListener("click", () => {
      closeDialog(nodes.newEntryDialog);
    });

    nodes.categoryNav.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-category-action]");
      const menuButton = event.target.closest("[data-category-menu]");
      const card = event.target.closest("[data-category-filter]");

      if (!card) {
        return;
      }

      if (menuButton) {
        event.stopPropagation();
        document.querySelectorAll(".category-item.menu-open").forEach((item) => {
          if (item !== card) {
            item.classList.remove("menu-open");
          }
        });
        card.classList.toggle("menu-open");
        return;
      }

      if (actionButton) {
        event.stopPropagation();
        card.classList.remove("menu-open");
        const categoryId = card.dataset.categoryFilter;
        const action = actionButton.dataset.categoryAction;

        if (categoryId === "all") {
          return;
        }

        if (action === "create-entry") {
          openNewEntryDialog(categoryId);
        } else if (action === "rename") {
          renameCategory(categoryId);
        } else if (action === "create-child") {
          createCategory(categoryId);
        } else if (action === "import") {
          state.importTargetCategoryId = categoryId;
          nodes.importInput.click();
        } else if (action === "delete") {
          deleteCategory(categoryId);
        }
        return;
      }

      if (!event.target.closest("[data-category-open]")) {
        return;
      }

      state.selectedCategoryId = card.dataset.categoryFilter;
      render();
    });

    nodes.categoryNav.addEventListener("mouseover", (event) => {
      const menuArea = event.target.closest(".category-actions");

      if (!menuArea) {
        return;
      }

      const card = menuArea.closest("[data-category-filter]");

      if (!card) {
        return;
      }

      document.querySelectorAll(".category-item.menu-open").forEach((item) => {
        if (item !== card) {
          item.classList.remove("menu-open");
        }
      });
      card.classList.add("menu-open");
    });

    nodes.categoryNav.addEventListener("mouseout", (event) => {
      const card = event.target.closest("[data-category-filter]");

      if (!card || card.contains(event.relatedTarget)) {
        return;
      }

      card.classList.remove("menu-open");
    });

    nodes.entryList.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-entry-action]");
      const menuButton = event.target.closest("[data-entry-menu]");
      const card = event.target.closest("[data-entry-id]");

      if (!card) {
        return;
      }

      if (menuButton) {
        event.stopPropagation();
        document.querySelectorAll(".entry-card.menu-open").forEach((item) => {
          if (item !== card) {
            item.classList.remove("menu-open");
          }
        });
        card.classList.toggle("menu-open");
        return;
      }

      if (actionButton) {
        event.stopPropagation();
        card.classList.remove("menu-open");
        const entryId = card.dataset.entryId;
        const action = actionButton.dataset.entryAction;

        if (action === "rename") {
          renameEntry(entryId);
        } else if (action === "category") {
          changeEntryCategory(entryId);
        } else if (action === "export") {
          exportEntry(entryId);
        } else if (action === "delete") {
          deleteEntry(entryId);
        }
        return;
      }

      if (!event.target.closest("[data-entry-open]")) {
        return;
      }

      state.selectedEntryId = card.dataset.entryId;
      render();
    });

    nodes.entryList.addEventListener("mouseover", (event) => {
      const menuArea = event.target.closest(".entry-actions");

      if (!menuArea) {
        return;
      }

      const card = menuArea.closest("[data-entry-id]");

      if (!card) {
        return;
      }

      document.querySelectorAll(".entry-card.menu-open").forEach((item) => {
        if (item !== card) {
          item.classList.remove("menu-open");
        }
      });
      card.classList.add("menu-open");
    });

    nodes.entryList.addEventListener("mouseout", (event) => {
      const card = event.target.closest("[data-entry-id]");

      if (!card || card.contains(event.relatedTarget)) {
        return;
      }

      card.classList.remove("menu-open");
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest(".entry-actions") || event.target.closest(".category-actions")) {
        return;
      }

      document.querySelectorAll(".entry-card.menu-open").forEach((card) => {
        card.classList.remove("menu-open");
      });
      document.querySelectorAll(".category-item.menu-open").forEach((card) => {
        card.classList.remove("menu-open");
      });
    });

    nodes.searchInput.addEventListener("input", () => {
      state.searchQuery = nodes.searchInput.value;
      renderEntryList();
    });

    nodes.titleInput.addEventListener("input", scheduleSave);
    nodes.contentInput.addEventListener("input", () => {
      renderPreview();
      scheduleSave();
    });

    document.addEventListener("keydown", async (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        window.clearTimeout(state.saveTimer);
        await saveSelectedEntry({ manual: true });
      }
    });

    nodes.imageInput.addEventListener("change", async () => {
      await addImage(nodes.imageInput.files[0]);
      nodes.imageInput.value = "";
    });

    nodes.editorGrid.addEventListener("dragover", (event) => {
      if (!getSelectedEntry()) {
        return;
      }

      event.preventDefault();
      nodes.editorGrid.classList.add("drag-over");
    });

    nodes.editorGrid.addEventListener("dragleave", () => {
      nodes.editorGrid.classList.remove("drag-over");
    });

    nodes.editorGrid.addEventListener("drop", async (event) => {
      if (!getSelectedEntry()) {
        return;
      }

      event.preventDefault();
      nodes.editorGrid.classList.remove("drag-over");

      const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));

      for (const file of files) {
        await addImage(file);
      }
    });

    nodes.importInput.addEventListener("change", async () => {
      try {
        await importData(nodes.importInput.files[0], state.importTargetCategoryId);
      } catch (error) {
        await showMessage("导入失败", error.message || "导入文件无法读取。请确认它是 MyNote 导出的 JSON 工作区文件。");
      } finally {
        state.importTargetCategoryId = null;
        nodes.importInput.value = "";
      }
    });
  }

  async function init() {
    validateNodes();
    bindEvents();
    await loadState();
    render();
  }

  init().catch((error) => {
    console.error(error);
    showMessage("初始化失败", error.message || "页面初始化时发生未知错误。");
  });
})();
