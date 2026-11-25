<div align="center">

# vmd · Markdown Browser

**一款轻量、可自托管的现代化 Markdown 与多媒体文件浏览器，支持在线编辑、类 Finder 多视图、实时文件同步与可扩展插件体系。**

<p>
  <a href="./README.md">English</a> ·
  <strong>简体中文</strong> ·
  <a href="./README.ja.md">日本語</a>
</p>

<p>
  <a href="https://github.com/yedeying/markdown-browser/releases">
    <img src="https://img.shields.io/github/v/release/yedeying/markdown-browser?style=flat-square&logo=github" alt="Release" />
  </a>
  <a href="https://github.com/yedeying/markdown-browser/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/yedeying/markdown-browser/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions" alt="CI" />
  </a>
  <a href="https://github.com/yedeying/markdown-browser/actions/workflows/release.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/yedeying/markdown-browser/release.yml?style=flat-square&label=Release&logo=docker" alt="Release Build" />
  </a>
  <a href="https://github.com/yedeying/markdown-browser/pkgs/container/markdown-browser">
    <img src="https://img.shields.io/badge/ghcr.io-markdown--browser-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker Image" />
  </a>
  <a href="https://github.com/yedeying/markdown-browser/stargazers">
    <img src="https://img.shields.io/github/stars/yedeying/markdown-browser?style=flat-square&logo=github" alt="GitHub Stars" />
  </a>
  <img src="https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square" alt="License MIT" />
</p>

<p>
  <img src="https://img.shields.io/badge/Bun-1.0+-fbf0df?style=flat-square&logo=bun&logoColor=000" alt="Bun" />
  <img src="https://img.shields.io/badge/Preact-10-673ab8?style=flat-square&logo=preact&logoColor=fff" alt="Preact" />
  <img src="https://img.shields.io/badge/Hono-4-e36002?style=flat-square&logo=hono&logoColor=fff" alt="Hono" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=fff" alt="TypeScript" />
  <img src="https://img.shields.io/badge/CodeMirror-6-d30707?style=flat-square&logo=codemirror&logoColor=fff" alt="CodeMirror 6" />
  <img src="https://img.shields.io/badge/Playwright-E2E-2ead33?style=flat-square&logo=playwright&logoColor=fff" alt="Playwright" />
</p>

<p>
  <a href="#-核心特性">核心特性</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-docker-部署">Docker 部署</a> ·
  <a href="#-插件体系">插件体系</a> ·
  <a href="#-快捷键">快捷键</a> ·
  <a href="#-api-参考">API 参考</a> ·
  <a href="#-开发与测试">开发与测试</a>
</p>

</div>

---

## ✨ 核心特性

### 📝 Markdown 与富文档阅读
- **完整 GFM 与扩展渲染**：内置 `marked`、`highlight.js`（35+ 编程语言高亮）、**KaTeX** 数学公式（`$...$` / `$$...$$`）与 **Mermaid 11** 图表。
- **沉浸式阅读增强**：自动解析 YAML Frontmatter 元数据表、标题章节折叠、悬浮大纲目录（TOC）、可点击排序的表格、交互式任务清单勾选、打印友好样式。
- **文档内联图片全屏预览**：点击 Markdown 内任意图片即可全屏打开 Lightbox，自动适配当前视窗，完整复刻图片查看器工具栏（缩放、适应窗口、90° 旋转、下载、复制路径、上下张切换），并支持左/中/右三分区域点击切图与移动端手势防冲突隔离。

### ✏️ 实时编辑与代码查看
- **CodeMirror 6 编辑器**：Markdown 支持分栏实时预览编辑，代码与文本文件支持全屏语法高亮编辑（支持 35+ 语言、常见特殊文件名与 shebang 自动推断）。
- **一键格式化**：内置 **Prettier 3** 一键格式化 Markdown 文档。
- **安全外部变更同步**：通过 SSE 实时感知磁盘文件改动；若本地存在未保存修改则弹出非破坏性更新提示条，避免覆盖编辑内容。

### 🖼️ 多格式内置预览插件
| 文件类型 | 内置插件 | 核心能力 |
| :--- | :--- | :--- |
| **Markdown** (`.md`, `.markdown`) | `builtin.markdown` | 富文本预览、分栏实时编辑、大纲、标题折叠、内联图全屏 Lightbox |
| **PDF 文档** (`.pdf`) | `builtin.pdf` | 全高内嵌文档预览、新标签页打开、下载、复制路径、分栏预览 |
| **图片** (`.png`, `.jpg`, `.webp`, `.gif`, `.svg`, `.heic`/`.heif` 等) | `builtin.image` | 缩放/适应窗口/90° 旋转、`Ctrl/Cmd`+滚轮缩放、HEIC 自动转码、全屏 Lightbox |
| **视频** (`.mp4`, `.webm`, `.mov`, `.ogg`, `.avi`) | `builtin.video` | HTTP `Range` 分片流式播放、视频封面帧提取 |
| **HTML 与静态站点** (`.html`、含 `index.html` 的目录) | `builtin.html`, `builtin.site-folder` | 独立预览与 `/site/` 静态目录托管 |
| **JSONL / 代码 / 纯文本** (`.jsonl`, `.ts`, `.py`, `.json`, `.txt` 等) | `builtin.jsonl`, `builtin.code`, `builtin.plaintext` | JSONL 结构化预览、代码高亮编辑、UTF-8/UTF-16/GBK 自动解码 |

### 📂 类 Finder 多视图文件管理
- **四种目录视图**：
  - **列表视图**：高密度可排序文件列表。
  - **网格视图**：支持 S / M / L 三档尺寸卡片与媒体缩略图。
  - **列视图**：仿 macOS Finder 多栏浏览器，多列叠加时自动将旧祖先列向左隐藏，始终为右侧预览面板保留充足阅读空间，并保持键盘 `←`/`→` 光标一致性。
  - **瀑布流画廊**：递归汇总目录内图片与视频，懒加载缩略图并无缝衔接全屏 Lightbox。
- **完整文件操作**：新建文件/文件夹、重命名、跨目录复制/剪切/粘贴、拖拽上传文件与嵌套目录、单文件及多选打包 ZIP 下载、隐藏文件开关、面包屑快速回退。
- **极速检索**：支持文件名即时搜索与服务端全文 `grep` 搜索。

### ⚡ 实时文件同步、多挂载与分享
- **按需目录监听（零全盘扫描）**：基于 SSE（`/api/watch` + `/api/watch/sync`）仅监听当前可视目录，配合 15s 断线宽限期与重连/切回前台 `mtimeMs` 增量校验，在 NAS 或大目录下依然零卡顿。
- **URL 直达文件极速加载**：外部插件、文件正文、`/api/stat` 与多级祖先目录树全并发加载，大幅缩短深链首屏耗时。
- **三种运行模式**：单文件模式、目录模式与 `--workspace` 多挂载工作区模式（`/m/<alias>/...`），内置 `/admin` 挂载管理后台。
- **只读分享与密码保护**：支持为任意文件或目录生成只读分享链接（`/share/<token>`），支持通过 `-P` / `VMD_PASSWORD` 开启全局密码登录。

---

## 🚀 快速开始

### 前置要求
- **[Bun](https://bun.sh/)** `v1.0+`
- **Docker**（可选，用于容器部署）

### 从源码运行

```bash
git clone https://github.com/yedeying/markdown-browser.git
cd markdown-browser

# 安装依赖并构建前后端
bun install
bun run build

# 目录模式（默认端口 8888）
./vmd ~/docs

# 单文件模式
./vmd ~/notes/README.md

# 指定端口与访问密码
./vmd ~/docs --port 9000 --password secret

# 多挂载工作区模式
./vmd --workspace /workspace \
  --mount docs:文档:docs \
  --mount notes:笔记:personal-notes
```

在浏览器访问 `http://localhost:8888`。

---

## 🐳 Docker 部署

每次推送 `v*` 标签后，CI 会自动构建并发布多架构镜像至 GHCR：

```
ghcr.io/yedeying/markdown-browser:latest
```

### 一键启动

```bash
docker run -d \
  --name vmd-server \
  -p 8888:8888 \
  -v /path/to/your/docs:/workspace \
  -e TZ=Asia/Shanghai \
  ghcr.io/yedeying/markdown-browser:latest
```

### Docker Compose

```yaml
services:
  vmd:
    image: ghcr.io/yedeying/markdown-browser:latest
    container_name: vmd-server
    restart: unless-stopped
    ports:
      - "8888:8888"
    volumes:
      - ./workspace:/workspace
      # 可选：挂载外部运行时插件目录
      # - ./plugins:/plugins:ro
    environment:
      TZ: Asia/Shanghai
      # VMD_PASSWORD: "change-me"
      # VMD_PLUGINS_DIR: "/plugins"
      # VMD_IMAGE_TRANSFORM: "0"
      # VMD_MASONRY_RECURSE_DEPTH: "3"
```

更多反向代理、权限挂载与故障排查说明请参阅 [DOCKER.md](./DOCKER.md)。

---

## ⚙️ 启动参数与环境变量

### CLI 参数

| 参数 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `<path>` | — | 目标文件（单文件模式）或目录（目录模式） |
| `-p, --port <n>` | `8888` | HTTP 监听端口 |
| `--host <host>` | `0.0.0.0` | 绑定主机地址 |
| `-P, --password <pw>` | — | 访问密码（优先级高于 `VMD_PASSWORD`） |
| `--workspace <dir>` | — | 启用多挂载工作区模式（读取 `<workspace>/.vmd-config.json`） |
| `--mount <alias>:<name>:<subpath>` | — | 追加挂载点（可多次指定，仅 `--workspace` 模式有效） |
| `--plugins <dir>` | `<root>/.vmd-plugins` | 外部运行时插件目录 |
| `-h, --help` | — | 显示帮助信息 |

### 环境变量

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `VMD_PASSWORD` | — | Web 与 API 全局访问密码 |
| `VMD_PLUGINS_DIR` | — | 外部运行时插件目录路径 |
| `VMD_IMAGE_TRANSFORM` | `0`（Docker）/ `1`（本地） | 是否启用可选实时图片缩放/转码（HEIC/HEIF 始终自动转码） |
| `VMD_MASONRY_RECURSE_DEPTH` | `3` | 瀑布流画廊递归扫描最大深度 |
| `TZ` | `UTC` | 容器时区 |

---

## 🧩 插件体系

`vmd` 支持免重新编译的外部运行时插件。将插件放入 `--plugins <dir>`（或 `<workspace>/.vmd-plugins`）下的独立子目录即可自动发现：

```
.vmd-plugins/
└── my-custom-viewer/
    ├── plugin.json
    ├── index.js
    └── style.css
```

**`plugin.json`**：
```json
{
  "id": "ext.my-custom-viewer",
  "name": "自定义预览插件",
  "entry": "index.js",
  "styles": ["style.css"]
}
```

**`index.js`**（原生 ESM，接收包含 Preact `h`、`hooks` 等能力的运行时 `sdk`）：
```js
export default function createPlugin(sdk) {
  const { h } = sdk
  return {
    id: 'ext.my-custom-viewer',
    name: '自定义预览插件',
    priority: 100,
    target: 'file',
    matchPath: ({ ext }) => ext === '.log',
    sniffAndParse: ({ content }) => content.startsWith('CUSTOM:') ? { raw: content } : null,
    renderMain: ({ parsed }) => h('pre', { class: 'my-viewer' }, parsed.raw),
  }
}
```

外部插件由 `GET /api/plugins` 自动发现，携带 `?v=<mtime>` 破坏缓存并异步并行加载，不阻塞首屏渲染。

---

## ⌨️ 快捷键

| 场景 | 按键 | 功能 |
| :--- | :--- | :--- |
| **侧边栏 / 目录视图** | `↑` / `↓` 或 `k` / `j` | 上下移动光标 |
| **侧边栏 / 列视图** | `→` / `l` 或 `Enter` | 进入目录 / 聚焦预览 / 打开文件 |
| **侧边栏 / 列视图** | `←` / `h` | 返回上一列或将焦点退回侧边栏 |
| **列预览聚焦态** | `↑` / `↓` | 上下滚动预览内容 |
| **图片全屏预览** | `←` / `→` 或 `h` / `l` | 上一张 / 下一张 |
| **图片全屏预览** | `Esc` | 关闭全屏预览 |
| **图片全屏预览** | `Ctrl` / `Cmd` + 滚轮 | 放大 / 缩小 |
| **图片全屏预览（触屏 / 点击）** | 画面左 / 中 / 右三分区域 | 上一张 / 显隐工具栏 / 下一张 |

---

## 🔌 API 参考

> 多挂载模式下所有路径需加上 `/m/<alias>` 前缀（如 `/m/docs/api/files`）。

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `GET` | `/api/files?path=<dir>&depth=1&showHidden=0` | 懒加载列举目录下一层节点 |
| `GET` | `/api/stat?path=<path>` | 查询相对路径的文件/目录元信息 |
| `GET` | `/api/file/<path>` | 读取文本内容（自动识别 UTF-8 / UTF-16 / GBK） |
| `POST` | `/api/save/<path>` | 保存文本文件（自动拦截二进制扩展名） |
| `GET` | `/api/asset/<path>[?w=&fmt=&poster=1]` | 静态资源直出、缩略图转码、视频封面提取（支持 HTTP Range） |
| `GET` | `/api/search?q=<kw>&type=name\|content` | 文件名搜索或全文内容搜索 |
| `GET` | `/api/download/<path>` | 单文件附件下载 |
| `POST` | `/api/download/zip` | 多文件/文件夹打包 ZIP 下载 |
| `POST` | `/api/upload` | 上传文件或目录结构 |
| `GET` | `/api/watch?clientId=<id>` | SSE 实时文件变更推送（`tree-change` / `reload`） |
| `POST` | `/api/watch/sync` | 同步客户端当前可视目录集合到服务端监听 |
| `POST` | `/api/files/check-mtime` | 批量校验可视目录 `mtimeMs` 实现断线增量补刷 |
| `GET` | `/api/plugins` | 获取已挂载的外部运行时插件清单 |
| `GET` | `/site/<dir>/<entry>` | 静态 HTML 目录站点直出 |

---

## 🏗️ 项目结构

```
markdown-browser/
├── src/
│   ├── cli.ts                    # CLI 入口与参数解析
│   ├── types.ts                  # 前后端共享类型定义
│   ├── client/                   # 前端（Preact 10 + TypeScript + Vite）
│   │   ├── main.tsx              # 启动入口、主题与插件初始化
│   │   ├── App.tsx               # 路由分发（单文件 / 目录 / 多挂载）与深链加载
│   │   ├── components/           # Sidebar、ContentArea、Folder*View、Editor、MediaLightbox、PdfViewer 等
│   │   ├── hooks/                # useFileTree、useFileContent、useSSE、useSearch、useTheme 等
│   │   ├── plugins/              # PluginRegistry、外部插件加载器、SDK 与 builtin/* 内置插件
│   │   ├── utils/                # Markdown 解析、fileType、columnStack、keyboardNav、fsApi 等
│   │   └── styles/               # 模块化样式（主题、布局、组件、Markdown、打印）
│   └── server/                   # 后端（Bun + Hono 4）
│       ├── index.ts              # 服务启动与中间件
│       ├── watcher.ts            # 按需目录监听与 SSE 广播
│       ├── mount-manager.ts      # 多挂载配置持久化
│       ├── image-transform.ts    # Sharp + HEIC 图片转码
│       ├── plugins.ts            # 外部插件扫描与资源路由
│       ├── share.ts              # 分享令牌管理与只读访问路由
│       └── routes/               # dir、single、admin、auth 路由
├── tests/
│   ├── e2e/                      # Playwright 端到端测试
│   └── fixtures/                 # 测试用示例目录
├── Dockerfile                    # 多阶段生产镜像构建
└── .github/workflows/            # CI（单测 + 构建 + E2E）与 Release（GHCR 推送）
```

---

## 🧪 开发与测试

```bash
# 启动 Vite 前端开发服务器
bun run dev

# 运行单元测试（450+ 项 bun:test 用例）
bun test

# 运行 Playwright 端到端测试
bun run test:e2e

# 生产构建（前端 -> dist/client/，服务端 -> dist/cli.js）
bun run build
```

---

## 🤝 参与贡献

欢迎提交 [Issue](https://github.com/yedeying/markdown-browser/issues) 反馈建议或发起 Pull Request！

## 📄 开源协议

本项目基于 [MIT License](https://opensource.org/licenses/MIT) 开源。
