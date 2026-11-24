# 文件与文件夹类型插件化架构设计

## 1. 背景与目标

`markdown-browser` 支持 Markdown、HTML、代码（JS/TS/Vue/Python/Go 等）、图片/视频、JSONL 及静态站点目录预览。为避免新增垂直格式（如各类聊天导出、专用数据格式）持续侵入核心组件与样式表，系统将**文件/文件夹的识别逻辑与展示逻辑**统一抽象为插件注册表（`PluginRegistry`）：

- **内部能力插件化**：原有 Markdown、HTML、媒体、JSONL、代码/纯文本、静态站点目录均作为内置插件（`src/client/plugins/builtin/`）注册。
- **外部插件运行时注入**：支持通过 `--plugins <dir>` 或 `VMD_PLUGINS_DIR` 环境变量（或在工作区放置 `.vmd-plugins/`）在运行时挂载外部预编译 ESM 插件包，无需重新构建主仓库或修改官方镜像。

## 2. 插件协议（`VmdPlugin`）

定义于 `src/client/plugins/types.ts`：

- **优先级与两阶段匹配**：
  1. `matchPath(ctx)`：零 IO 路径/扩展名/目录子项初筛；
  2. `sniffAndParse?(ctx)`：内容嗅探与解析，返回 `null` 时自动回退到更低优先级插件（如专用 `.txt` 插件嗅探不命中时回落至 `builtin.plaintext`）。
- **多槽位渲染**：
  - `renderMain(ctx)`：主预览区渲染；
  - `renderFolder(ctx)`：文件夹自定义视图（如含 `index.html` 的目录切换为 iframe 网页视图）；
  - `renderColumnPreview(ctx)`：Finder 分栏列视图紧凑预览；
  - `renderToc(ctx)`：右侧目录侧栏槽位。
- **声明式交互扩展**：
  - `modes` + `supportsSource`：宿主顶栏与移动端菜单自动生成统一分段切换；
  - `settings`：宿主自动持久化至 `localStorage`（`vmd_plugin_<id>_<key>`），并在设置弹窗与顶栏快捷入口自动渲染；
  - `onConsumeJump` + `jumpStore`：支持列视图带上下文跳转定位至主视图目标节点。

## 3. 外部运行时注入机制

1. **服务端托管（`src/server/plugins.ts`）**：
   - `GET /api/plugins`：扫描外部插件目录下各子目录的 `manifest.json`（含 `id`、`name`、`entry`、`styles`）；
   - `GET /plugins/:dir/*`：严格路径边界校验后静态托管插件 ESM 脚本与 CSS。
2. **前端共享 SDK 与动态加载（`src/client/plugins/sdk.ts` & `loader.ts`）**：
   - 启动时在 `window.__VMD_SDK__` 挂载宿主 `preact`、`hooks`、基础 UI 组件、偏好与跳转 API；
   - 外部插件构建时将 `preact` / `preact/hooks` 重定向至 `window.__VMD_SDK__`，避免多 Preact 实例冲突并显著减小单插件体积；
   - 宿主启动时拉取 `/api/plugins`，自动挂载插件样式表并执行原生 `import(entryUrl)` 注册进 `pluginRegistry`。
