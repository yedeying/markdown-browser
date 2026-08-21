# ST 对话预览：HTML 原样渲染与居中左对齐布局

修订既有功能 `docs/superpowers/specs/2026-08-20-jsonl-st-preview-design.md`（§3.2 / 决策表 / 非目标）。

## 已确认决策

| 项 | 选择 |
| --- | --- |
| HTML | 与普通 Markdown 预览一致：原样进 DOM（方案 A） |
| 对齐 | 用户与角色气泡均左对齐；用户靠 accent 底色区分 |
| 栏宽 | `.st-chat-preview` 使用 `max-width: var(--reading-width)` 居中，类似 `.markdown-body` |
| 链接 | 仍保留隔离 Marked + 协议白名单 + `href` 属性转义 |

## 1. 渲染

- `mes` / `extra.reasoning`：Markdown + **原样 HTML**（去掉把 `html` token 转义成文本的逻辑）。
- 继续使用每次新建的隔离 `Marked` 实例；`link` / `image` 仍校验 `http`/`https`/`mailto`/相对路径。
- 废弃仅服务「先转义 HTML」策略的 `escapeHtmlForMarkdown`（若无其它调用则删除）。
- 信任模型：本机预览自有文件，与 `.md` 预览同级；不引入 DOMPurify。

## 2. 布局

- `.st-chat-preview`：`max-width: var(--reading-width)`；`margin-left/right: auto`。
- `.st-bubble-row-user` / `.st-bubble-row-char`：均为 `justify-content: flex-start`。
- `.st-bubble`：栏内接近满宽（如 `width: 100%; max-width: 100%`），去掉右靠与 `88%` 不对称宽度。
- 用户气泡继续 `background: var(--accent-soft)` + accent 边框。

## 3. 文档与验证

- 更新主 design §3.2、决策表；从「非目标」删除「按 HTML 富文本还原 `mes`」。
- 更新 `st_jsonl.md`：HTML 可渲染；对齐说明改为全左 + 高亮色。
- 单测：可见 HTML 进 DOM；代码块内 `<` 仍单次转义；危险链接仍拦截。
- E2E：调整「script 必须显示为纯文本」为与 Markdown 同级行为；覆盖左对齐与阅读栏居中（能稳定断言的部分）。

## 4. 非目标

- 不改变 ST 识别 schema、模式切换偏好、reasoning 默认折叠。
- 不做 swipes、不做服务端预解析。
