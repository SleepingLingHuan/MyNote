# 本地日记/随笔网站技术设计方案

## 1. 背景与目标

本项目是一个面向个人使用的本地日记/随笔记录网站。核心体验接近 Personal Blog，但不公开发布，重点是本地保存、Markdown 写作、按单一分类浏览，以及清新简约的长期使用体验。

设计目标：

- 支持写日记、随笔、杂谈等长文本内容。
- 每篇文章只能归属一个分类，例如“情感”或“学习”，暂不设计多 Tag。
- 文本和图片均本地保存，插入图片时保留本地副本。
- 编辑器兼容 Markdown 常用语法，支持预览。
- 万字文章和多图文章仍能快速编辑、浏览和搜索。
- 开发阶段以网页形态为主，后续可平滑迁移为 macOS 桌面端。
- 界面风格清新、简约、淡雅，避免大字号、营销式页面和过多说明文本。

非目标：

- 不做公开博客发布、账号系统、多人协作、云同步。
- 不做复杂 Tag、多级权限、评论、订阅等公共博客能力。
- 不在 MVP 阶段引入复杂插件市场或主题系统。

## 2. 关键假设与取舍

### 2.1 假设

- 用户主要在 macOS 上本地使用，开发和预览可以通过本地 dev server 打开网页。
- 初期单人使用，数据规模以个人多年日记为准，而不是多人知识库。
- “静态网页设计方式”理解为前端单页应用优先，不依赖后端业务服务。
- 后续桌面端优先考虑 Tauri，而不是从头重写为原生 macOS 应用。

### 2.2 主要取舍

普通浏览器中的静态网页无法长期、稳定、无提示地读写任意本地目录。可选方案有三种：

1. 浏览器本地存储：实现简单，响应快，但数据目录不直观，需要导入导出。
2. File System Access API：可选择本地工作区目录，文件更透明，但浏览器兼容性有限。
3. Tauri 桌面端文件系统：最适合长期本地保存，但需要桌面打包。

推荐方案是先做“本地优先的 Web SPA”，并从第一天抽象存储层：

- 浏览器阶段使用 IndexedDB/OPFS 保存文章、索引和图片副本。
- 提供导入/导出工作区能力，避免数据被浏览器存储机制锁死。
- 桌面阶段将同一套前端接入 Tauri 文件系统和本地数据库。

这个方案比一开始直接做完整桌面端更轻，但不会把后续迁移路径堵死。

## 3. 技术栈建议

### 3.1 前端基础

- 构建工具：Vite
- 语言：TypeScript
- UI 框架：React
- 样式：CSS Modules 或普通 CSS 变量，先不引入大型组件库
- 图标：lucide-react

选择理由：

- Vite 对本地开发和静态构建友好，后续也容易接入 Tauri。
- React 生态成熟，Markdown 编辑、虚拟列表、状态管理等选择充分。
- TypeScript 能约束文章、分类、资源等核心数据结构，降低后续迁移风险。
- 不使用大型 UI 组件库，避免默认风格过重，方便实现清新、安静的写作界面。

### 3.2 Markdown 能力

推荐编辑方案：

- 编辑器：CodeMirror 6
- Markdown 解析：markdown-it 或 unified/remark
- 代码高亮：Shiki
- 数学公式：后续需要时再加 KaTeX

MVP 提供两种模式：

- 编辑模式：左侧或主区域为 Markdown 输入。
- 预览模式：渲染为阅读排版。

暂不做完整所见即所得。原因是 WYSIWYG Markdown 编辑器集成复杂度更高，容易在图片、表格、代码块等边界上产生额外维护成本。先保证纯 Markdown 稳定、快速、可迁移。

### 3.3 本地存储

浏览器阶段：

- IndexedDB 保存文章元数据、分类、文章 Markdown 正文。
- OPFS 或 IndexedDB Blob 保存图片副本。
- localStorage 仅保存轻量 UI 偏好，例如主题、侧栏状态、最近打开文章。

桌面阶段：

- Tauri 负责文件系统访问。
- SQLite 或文件索引保存文章列表、分类、更新时间、摘要等查询字段。
- Markdown 文件和图片文件作为可导出的真实资产保存。

建议工作区结构：

```text
MyNoteWorkspace/
  manifest.json
  entries/
    2026/
      2026-07-02-example.md
  assets/
    entry-id/
      image-001.png
  index/
    search-index.json
```

其中 `manifest.json` 保存工作区版本、分类列表和迁移信息；`entries/` 保存 Markdown 正文；`assets/` 保存文章图片副本；`index/` 是可重建缓存，不作为唯一数据源。

## 4. 核心数据模型

```ts
type Category = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

type Entry = {
  id: string;
  title: string;
  categoryId: string;
  contentMarkdown: string;
  excerpt: string;
  assetIds: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

type Asset = {
  id: string;
  entryId: string;
  fileName: string;
  mimeType: string;
  size: number;
  localPath?: string;
  createdAt: string;
};
```

约束：

- `Entry.categoryId` 必须指向一个分类。
- 一篇文章只有一个 `categoryId`，不提供 tags 字段。
- 图片插入时创建 `Asset`，正文中引用内部资源地址，例如 `my-note-asset://asset-id`，渲染时再转换为可访问 URL。
- `excerpt` 可由正文自动生成，避免列表页反复解析长 Markdown。

## 5. 页面与交互设计

### 5.1 信息架构

主要页面：

- 首页/文章列表：显示最近文章、分类筛选、搜索入口。
- 分类视图：按单一分类查看文章。
- 编辑页：Markdown 编辑、图片插入、分类选择、保存状态。
- 阅读页：高质量 Markdown 排版、图片查看、返回编辑。
- 设置页：工作区导入导出、数据备份、外观偏好。

### 5.2 布局原则

- 桌面端采用三栏或两栏：分类导航、文章列表、内容区。
- 小屏采用顶部导航加单列内容，避免信息挤压。
- 正文区域最大宽度控制在舒适阅读范围，避免长行。
- 不做营销式首屏，不使用大字号标题堆砌。
- 编辑器工具栏以图标按钮为主，常用操作可提供 tooltip。

### 5.3 视觉方向

- 背景使用接近白色的低饱和色，不使用大面积深色或强渐变。
- 分类颜色使用低饱和点缀，而不是整页主题色。
- 卡片只用于文章列表项、弹窗和具体工具容器，不把整页切成大量卡片。
- 动画保持轻量：页面切换、列表 hover、保存状态反馈控制在 120-200ms。
- 字号整体克制，标题层级清晰但不夸张。

## 6. 关键功能设计

### 6.1 文章创建与编辑

流程：

1. 用户点击新建。
2. 系统创建草稿，默认分类为最近使用分类或“未分类”。
3. 用户输入标题和正文。
4. 内容自动保存到本地存储。
5. 用户可切换阅读预览。

验证标准：

- 新建文章后刷新页面，草稿仍存在。
- 万字 Markdown 输入不卡顿，滚动和输入保持可用。
- 标题、分类、正文更新后能自动保存。

### 6.2 分类管理

功能：

- 新建分类。
- 重命名分类。
- 给分类设置低饱和颜色。
- 按分类过滤文章。

约束：

- 删除分类前必须处理其下文章。MVP 可先不提供删除，只提供重命名。
- 文章必须有且只有一个分类。

### 6.3 图片插入

流程：

1. 用户拖拽或选择图片。
2. 系统复制图片到本地资产存储。
3. 创建 `Asset` 记录。
4. 在 Markdown 中插入图片引用。
5. 预览和阅读页将内部引用解析为真实图片 URL。

验证标准：

- 删除原始图片后，文章中的图片仍可显示。
- 导出工作区后，图片文件随文章一起存在。

### 6.4 搜索与列表

MVP 搜索范围：

- 标题。
- 摘要。
- 正文纯文本。

性能策略：

- 保存文章时更新轻量搜索字段。
- 列表页不解析完整 Markdown。
- 大量文章时使用虚拟列表。
- 图片懒加载，阅读页只加载可视区域附近图片。

### 6.5 备份与迁移

浏览器阶段必须提供：

- 导出为工作区压缩包。
- 从工作区压缩包导入。

桌面阶段提供：

- 选择工作区目录。
- 自动备份 `manifest.json` 和文章文件。
- 可重新生成搜索索引。

## 7. 模块划分

```text
src/
  app/
    App.tsx
    routes.tsx
  domain/
    entry.ts
    category.ts
    asset.ts
  storage/
    StorageProvider.ts
    indexedDbStorage.ts
    tauriStorage.ts
  markdown/
    parser.ts
    renderer.tsx
    assetResolver.ts
  ui/
    layout/
    editor/
    entry-list/
    category-nav/
  styles/
    tokens.css
    global.css
```

模块原则：

- `domain/` 只放类型和纯业务规则。
- `storage/` 通过统一接口读写数据，避免页面直接依赖 IndexedDB 或 Tauri。
- `markdown/` 负责解析、渲染和图片引用转换。
- `ui/` 只处理展示和交互。

核心存储接口：

```ts
interface StorageProvider {
  listEntries(filter?: { categoryId?: string; query?: string }): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | null>;
  saveEntry(entry: Entry): Promise<void>;
  listCategories(): Promise<Category[]>;
  saveCategory(category: Category): Promise<void>;
  saveAsset(input: { entryId: string; file: File }): Promise<Asset>;
  resolveAssetUrl(assetId: string): Promise<string>;
  exportWorkspace(): Promise<Blob>;
  importWorkspace(file: File): Promise<void>;
}
```

## 8. 性能设计

目标：

- 万字文章打开时间保持在可感知的快速范围内。
- 图片不阻塞正文渲染。
- 列表页不因文章数量增长明显变慢。

措施：

- 编辑页对 Markdown 预览做 debounce。
- 文章列表使用预计算摘要，不实时解析全文。
- 搜索索引在保存时增量更新。
- 图片使用压缩预览图和懒加载。
- 长列表使用虚拟滚动。
- 自动保存使用节流，避免每次键入都写数据库。

## 9. 数据安全与备份

本项目虽然不涉及云端账号，但本地数据仍需要防丢失设计：

- 自动保存状态必须可见，例如“已保存”“保存中”“保存失败”。
- 导出工作区是 MVP 必需功能。
- 图片资产和 Markdown 正文必须一同导出。
- 桌面端阶段增加定期本地备份。
- 数据迁移使用 `manifest.json` 中的版本号控制。

## 10. 分阶段实现计划

### 阶段 1：Web MVP

范围：

- Vite + React + TypeScript 项目。
- 基础布局、文章列表、编辑页、阅读预览。
- 分类创建和筛选。
- IndexedDB 本地保存。
- 图片插入并复制到本地浏览器存储。
- 工作区导入导出。

验证：

- 刷新页面数据不丢失。
- 万字文章可编辑和预览。
- 图片源文件删除后，文章图片仍可显示。
- 导出后重新导入，文章和图片完整。

### 阶段 2：体验与性能优化

范围：

- 搜索。
- 虚拟列表。
- 图片懒加载。
- 更完整的 Markdown 样式。
- 自动保存状态和错误提示。

验证：

- 多文章列表滚动流畅。
- 长文预览不阻塞输入。
- 搜索结果准确。

### 阶段 3：桌面端迁移

范围：

- 接入 Tauri。
- 新增 `tauriStorage`。
- 支持选择工作区目录。
- 将 Markdown 和图片保存为真实文件。

验证：

- 同一前端页面在浏览器和 Tauri 中可复用。
- 桌面端关闭后重新打开，工作区内容完整。
- 工作区文件可人工查看和备份。

## 11. 测试策略

单元测试：

- 分类规则：文章只能有一个分类。
- Markdown 图片引用转换。
- 摘要生成。
- 存储接口的基本读写。

集成测试：

- 新建文章、编辑、刷新后恢复。
- 插入图片、预览显示、导出导入。
- 分类筛选。

视觉与交互检查：

- 桌面宽屏、普通笔记本、小屏宽度。
- 文本不溢出按钮和列表项。
- 长标题、长分类名、长文章内容不会破坏布局。

## 12. 风险与应对

- 浏览器本地文件访问能力受限：通过存储接口和导出导入降低风险，桌面端用 Tauri 解决。
- Markdown 编辑器复杂度超出预期：MVP 先用源码编辑加预览，不做 WYSIWYG。
- 图片过多导致存储膨胀：后续增加图片压缩和资产管理，MVP 先保证不丢失。
- UI 过度设计影响效率：先定义设计 tokens 和布局规则，再逐步细化动效。
- 搜索性能不足：先做轻量全文字段，必要时再引入专门搜索索引库。

## 13. 参考资料

- Vite: https://vite.dev/
- Tauri: https://tauri.app/
- MDN File System API: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- CodeMirror: https://codemirror.net/
- markdown-it: https://github.com/markdown-it/markdown-it
- Shiki: https://shiki.style/
