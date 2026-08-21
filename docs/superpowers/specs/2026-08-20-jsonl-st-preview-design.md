# JSONL / SillyTavern 预览设计

## 目标

让 `.jsonl` 可浏览、可编辑；当文件符合 SillyTavern（ST）聊天导出结构时，默认以聊天气泡阅读，并可切回普通 JSONL 逐行预览。同批修复：仅含非白名单文件的目录被隐藏、未知文件无法以纯文本打开、侧栏过窄且长文件名换行。

参考样例：`demo.jsonl`、`demo1.jsonl`（真实 ST 导出）。规范文档 `st_jsonl.md` 在本功能落地时按样例修订。

## 已确认决策

| 项 | 选择 |
| --- | --- |
| 架构 | 客户端解析 + 双预览组件（ST 对话 / 普通 JSONL） |
| ST 识别 | 以 demo 为真源的严格字段校验（见下） |
| 默认模式 | ST 通过 → 对话气泡；可切普通 JSONL；偏好记忆 |
| `mes` | 一律 Markdown；HTML **原样渲染**（与 `.md` 一致；见 `2026-08-20-st-chat-html-layout-design.md`） |
| 编辑 | 可预览 + 可源码编辑并保存 |
| ST 气泡内容 | 发言者、`mes`、角落 `extra.model`（有则显示）、`send_date`；非空 `extra.reasoning` 默认折叠展示 |
| swipes | 首批不展示、不可切换 |
| Header 展示 | 不展示 header 内容；仅用于识别 |
| 同批修复 | 目录可见性、未知文件纯文本、侧栏半屏与单行省略 |

## 1. 文件类型与入口

- 将 `.jsonl` 加入客户端 `fileType` / `getEditorLang` 与服务端 `SUPPORTED_EXTS` / 搜索 `--include`。
- 文件类型：可编辑文本；编辑器语言按 JSON/纯文本高亮（与 `.json` 同类即可）。
- `ContentArea`：`.jsonl` 默认进入预览；可切源码编辑并保存（与代码文件一致）。

## 2. ST 识别规则（修订 schema）

空行忽略。非空行全部须为合法 JSON 对象，否则整文件不算 ST。

### 2.1 可选首行 Header

若第 0 条非空行同时具备：

- `user_name`（存在）
- `character_name`（存在）
- `chat_metadata`（object）

则视为 header，**不参与消息列表**。Header 内容默认不渲染。

### 2.2 消息行（必选）

每条消息对象必须满足：

| 字段 | 类型 |
| --- | --- |
| `name` | string |
| `is_user` | boolean |
| `mes` | string |
| `send_date` | string |
| `extra` | object（可为 `{}`） |

可选（不得因缺失而失败）：`title`、`swipes`、`swipe_id`、`swipe_info`、`is_system`、`variables`、`variables_initialized`、`is_ejs_processed`、`force_avatar`、`gen_started`、`gen_finished`、以及其它扩展字段。

### 2.3 整文件判定

- 有 header：其余每一行都必须是合法消息；至少 1 条消息。
- 无 header：每一行都必须是合法消息；至少 1 条消息。
- 任一消息缺必选字段或类型不对 → 整文件 **不是** ST，走普通 JSONL 预览。
- 发言者权威字段为 `is_user`，不要用 `name` 推断左右。

识别与解析抽成纯函数模块，便于单测（以 `demo.jsonl` / `demo1.jsonl` 为正向样例；故意缺字段 / 非 JSONL 为负向样例）。

## 3. 预览 UI

### 3.1 模式切换

- ST 检测通过时，工具栏显示「对话 | JSONL」类切换（文案可微调）。
- 默认：对话。
- 用户选择写入 `localStorage`（例如 `vmd_jsonl_preview_mode`: `st` | `jsonl`），仅在 ST 文件上生效。
- 非 ST 的 `.jsonl` 不显示该切换，固定普通 JSONL 预览。

### 3.2 ST 对话预览

- 跳过 header；按行序渲染气泡。
- `is_user === true` 与 `false` **均左对齐**；用户气泡用 accent 底色区分（见 `2026-08-20-st-chat-html-layout-design.md`）。
- 气泡内：`name`、经 Markdown 渲染的 `mes`（**HTML 原样进 DOM**）、可选 `extra.model`、格式化后的 `send_date`。
- **Reasoning：** 当 `extra.reasoning` 为非空字符串时，在气泡内（正文上方或下方均可，推荐正文上方）以可折叠区块展示；**默认折叠**；展开后同样按 Markdown 渲染（HTML 策略与 `mes` 一致）。空字符串或缺失则不渲染该区块。
- 对话区整体 `max-width: var(--reading-width)` 居中，类似 Markdown 阅读栏。
- 顶栏：文件名、消息条数；角色名 = 首条 `is_user===false` 的 `name`；玩家名 = 首条 `is_user===true` 的 `name`（缺失则省略该项）。
- `\r\n` 规范为 `\n` 再交给 Markdown。
- 不做 swipes UI。

### 3.3 普通 JSONL 预览

- 每行一张卡片：行号 + pretty-print（`JSON.stringify(obj, null, 2)`）。
- 非法 JSON 行：保留原文并标为错误行。
- 卡片内容区允许横向滚动，避免撑破布局。

## 4. 同批修复

### 4.1 目录只要有内容就出现

现状：`listDir` 只收录白名单扩展名文件；递归组装时子目录若过滤后 children 为空则整夹丢弃，导致「目录里只有 `.jsonl`」时目录消失。

改为：

- 目录节点：只要磁盘上存在子项（文件或子目录，仍尊重隐藏文件开关与 `IGNORE_DIRS`），就保留在树中。
- 文件节点：白名单内的继续按类型展示；**非白名单文件也列入树**（未知类型），以便点开走 4.2。
- 空目录（磁盘上确实无子项）行为可保持现有策略（若当前会隐藏空目录，可继续隐藏；本修复针对「有文件但被扩展名过滤掉」）。

### 4.2 未知文件：先试纯文本

- 新类型或回落路径：扩展名不在已知集合时，打开时尝试按 UTF-8 文本读取。
- 成功 → 可滚动的纯文本 / CodeMirror plaintext 视图（修复当前无法滚动的问题）。
- 明显二进制（含 NUL 或解码失败策略需在实现中明确一种保守启发式）→ 「不支持的文件类型」空状态。
- `.jsonl` 本身走专用预览，不依赖这条回落；本条覆盖其它未登记扩展名。

### 4.3 侧栏宽度与行名

**侧栏最大宽度**

| 常量 / 函数 | 行为 |
| --- | --- |
| `SIDEBAR_WIDTH_MIN` | 200px（不变） |
| `SIDEBAR_WIDTH_MAX` | 1200px 硬上限（像素天花板，防止超宽屏占满整屏） |
| `clampSidebarWidth(width, viewportWidth?)` | 有效上限 = `min(SIDEBAR_WIDTH_MAX, max(SIDEBAR_WIDTH_MIN, floor(viewportWidth × 0.5)))`；再 clamp `width` 到 `[SIDEBAR_WIDTH_MIN, 有效上限]` |
| `viewportWidth` 默认 | 浏览器环境取 `window.innerWidth`；单测 / 无 `window` 时回退 1200 |

拖拽侧栏右缘、`setSidebarWidth` / `setPref('sidebarWidth')`、从 localStorage 读取时均走同一 `clampSidebarWidth`，保证偏好与 UI 一致。窗口缩放后若已存宽度超过新上限，下次读取时会自动回落（无需单独 resize 监听）。

**目录树 / 列表行名（单行省略）**

长文件名不得换行撑高行高。Flex 子项默认 `min-width: auto` 会阻止 `text-overflow: ellipsis`，因此：

| 选择器 | 规则 |
| --- | --- |
| `.folder-row`、`.file-row` | `min-width: 0; overflow: hidden` |
| `.folder-name` | `flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis` |
| `.file-info`、`.file-name` | 已有 `min-width: 0` + ellipsis（保持） |
| `.folder-list-name` | `flex: 1; min-width: 0` + 同上 ellipsis |

列视图 / 网格卡片名称不在本批范围（列视图行内 span 已有 inline ellipsis；网格刻意两行 clamp）。

## 5. 规范文档

更新根目录 `st_jsonl.md`：

- 记录可选 header 行。
- 将消息必选字段改为与 §2.2 一致（去掉对真实导出不成立的「title/swipes 必选」）。
- 注明扩展字段可存在；渲染只依赖 `is_user` + `name` + `mes`（外加本产品展示的 model/时间）。

## 6. 非目标（首批不做）

- swipes 切换与写回。
- 展示 `chat_metadata` / worldEngine 详情。
- 服务端预解析 JSONL API。
- 虚拟列表优化（样例为短文件；若后续超大 JSONL 再单开）。

## 7. 验证

- 单元：ST 检测（demo 正向、缺字段/无消息/非法行负向）；header 跳过；mes/reasoning Markdown+原样 HTML（链接协议白名单仍生效）。
- 单元/集成：目录仅含未知扩展名时仍出现在树中；未知文本文件可打开且内容区可滚动。
- 单元：侧栏宽度 clamp 允许 ≥ 约半屏；行名样式不换行。
- E2E（可选聚焦）：打开 `demo.jsonl` 见对话气泡；切换到 JSONL 模式见逐行卡片；偏好刷新后保持。
