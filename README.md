# vmd - Markdown Preview Tool

> 一个现代化的 Markdown 预览工具，支持目录浏览、实时编辑、多视图模式和 Docker 部署。

## 🎯 功能特性

### 核心功能
- **📁 目录模式**：浏览文件树、搜索 Markdown 文件、预览和编辑
- **📄 单文件模式**：预览单个 Markdown 文件，支持 SSE 热更新
- **🎨 主题切换**：亮色/暗色主题，偏好自动保存
- **✏️ 在线编辑**：集成 CodeMirror 6 编辑器，支持 Prettier 自动格式化（Markdown）
- **🔍 全文搜索**：支持文件名搜索和 grep 全文搜索

### 预览渲染
- **Markdown 渲染**：使用 marked + highlight.js，支持代码高亮（35+ 语言）
- **数学公式**：KaTeX 实时渲染
- **图表支持**：Mermaid 11（流程图、时序图、甘特图等）
- **代码块**：支持行号、语言标记和复制按钮

### 多媒体支持
- **代码文件**：完整屏幕编辑器（js、ts、py、json 等）
- **图片**：ImageViewer 组件，支持预览和缩略图
- **视频**：VideoViewer 组件，原生播放器

### 文件夹视图（类 Finder 风格）
- **三种视图模式**：列表 / 网格 / 列视图
- **网格卡片**：S/M/L 三种尺寸，支持图片缩略图
- **列视图**：多栏导航，点击文件夹展开新列
- **面包屑导航**：快速跳转父目录
- **视图偏好**：自动保存到 localStorage

## 🚀 快速开始

### 前置要求
- **Bun** v1.0+（自动管理 npm 依赖，比 Node.js 更快）
- **Docker**（可选，用于容器部署）

### 本地开发

#### 1. 安装依赖
```bash
# Bun 自动安装依赖
~/.bun/bin/bun install
```

#### 2. 开发模式
```bash
# 启动前端开发服务器（Vite）
~/.bun/bin/bun run dev
```

打开 `http://localhost:5173`

#### 3. 生产构建
```bash
# 一键完整构建（前端 + 后端）
~/.bun/bin/bun run build

# 或分别构建
~/.bun/bin/bun run build:client  # Vite 前端构建 → dist/client/
~/.bun/bin/bun run build:server  # 后端 CLI 构建 → dist/cli.js
```

#### 4. 运行服务

**目录模式**（浏览整个目录树）：
```bash
./vmd ~/docs          # 默认端口 8888
./vmd ~/docs 9000     # 指定端口
```

**单文件模式**（预览单个文件）：
```bash
./vmd ~/notes/my-doc.md
```

访问 `http://localhost:8888`

### Docker 部署

详见 [DOCKER.md](./DOCKER.md) 获取完整部署指南。

**快速开始**：
```bash
# 一键构建并运行（需要 docker 和 docker-compose）
./docker-run.sh ~/docs
```

## 📋 项目结构

```
markdown-preview/
├── src/
│   ├── cli.ts                      # CLI 入口 + 参数解析
│   ├── client/                     # 前端（Preact + TypeScript）
│   │   ├── main.tsx               # 入口
│   │   ├── App.tsx                # 根组件（路由逻辑）
│   │   ├── components/            # 20+ UI 组件
│   │   ├── hooks/                 # 6 个自定义 Hooks
│   │   ├── utils/                 # 工具函数
│   │   └── styles/                # 全局 + Markdown 样式
│   └── server/                    # 后端（Bun + Hono）
│       ├── index.ts               # 服务器启动
│       ├── watcher.ts             # 文件监听 + SSE
│       └── routes/                # API 路由
├── dist/                          # 编译产物
├── tests/
│   ├── e2e/                       # Playwright E2E 测试
│   └── fixtures/                  # 测试数据
├── index.html                     # 前端入口 HTML
├── vite.config.ts                 # Vite 配置
├── playwright.config.ts           # E2E 测试配置
├── vmd                            # 可执行脚本（入口）
├── docker-compose.yml             # Docker Compose
├── build.sh                       # 构建脚本
├── docker-run.sh                  # Docker 快速启动
└── package.json                   # 项目配置
```

## 🛠️ 技术栈

| 层 | 技术 | 版本 |
|-----|------|------|
| **运行时** | Bun | 1.0+ |
| **前端框架** | Preact | 10 |
| **编辑器** | CodeMirror | 6 |
| **服务器** | Hono | 4 |
| **Markdown** | marked | 11 |
| **代码高亮** | highlight.js | common |
| **数学公式** | KaTeX | 0.16 |
| **图表** | Mermaid | 11 |
| **格式化** | Prettier | 3 |
| **构建工具** | Vite | 5 |
| **测试** | Playwright | 1.40+ |
| **语言** | TypeScript | 5 |

## 💻 API 接口

### 目录模式

**获取目录结构**
```http
GET /api/files?path=<directory>
```

**搜索文件**
```http
GET /api/search?q=<keyword>&path=<directory>
```

**获取文件内容**
```http
GET /api/file?path=<file_path>
```

**保存文件**
```http
POST /api/file
Content-Type: application/json

{
  "path": "<file_path>",
  "content": "<file_content>"
}
```

**SSE 文件变动监听**
```http
GET /api/watch?path=<file_path>
```

### 单文件模式

**获取文件内容**
```http
GET /api/content
```

**保存文件**
```http
POST /api/save
Content-Type: application/json

{
  "content": "<file_content>"
}
```

**SSE 文件变动推送**
```http
GET /api/watch
```

### 资源接口

**获取资源缩略图**
```http
GET /api/asset?path=<asset_path>
```

## 📝 开发指南

### 构建流程

1. **前端构建**（Vite）
   - 入口：`src/client/main.tsx`
   - 输出：`dist/client/`
   - 配置：`vite.config.ts`（使用 `@preact/preset-vite`）

2. **后端构建**（Bun）
   - 入口：`src/cli.ts`
   - 输出：`dist/cli.js`
   - 目标：`target: 'bun'`

3. **运行**
   - 执行 `./vmd` 脚本（Bash）
   - 自动探测 bun 路径
   - 启动 `dist/cli.js`

### 关键组件

#### App.tsx
根组件，负责路由判断（目录 vs 单文件）和全局状态管理

#### FolderView.tsx
文件夹视图容器，管理视图模式切换（列表/网格/列）

#### MarkdownPreview.tsx
Markdown 渲染组件，使用 marked + highlight.js + KaTeX + Mermaid

#### Editor.tsx
CodeMirror 6 编辑器，支持 Prettier 格式化

#### ContentArea.tsx
中间内容区域，根据文件类型渲染不同组件（预览/编辑/图片/视频等）

### 主题系统

使用 CSS 变量 + localStorage 实现：
- 存储键：`vmd_theme`（light / dark）
- CSS 变量：`--primary-bg`、`--text-color` 等
- 自动切换：根据系统偏好（`prefers-color-scheme`）

### 状态管理

采用 Preact Hooks 管理局部状态：
- `useTheme`：主题管理
- `useFileTree`：文件树逻辑
- `useFileContent`：文件加载缓存
- `useSearch`：搜索过滤
- `useSSE`：Server-Sent Events 连接
- `useLongPress`：移动端长按

## 🧪 测试

### E2E 测试
```bash
~/.bun/bin/bun run test:e2e
```

测试套件位于 `tests/e2e/folder-view.spec.ts`（12 个测试用例）

测试数据位于 `tests/fixtures/docs/`

## 🐳 Docker 部署

### 快速开始
```bash
./docker-run.sh ~/docs          # 默认 8888 端口
./docker-run.sh ~/docs 9000     # 指定端口
```

### 完整指南
详见 [DOCKER.md](./DOCKER.md)

关键特性：
- **多阶段构建**：编译阶段 + 运行阶段，最终镜像 ~400-500MB
- **健康检查**：自动健康检查
- **环境变量**：支持 TZ（时区）等配置
- **挂载模式**：支持只读 (`:ro`) 和可写模式
- **日志管理**：自动日志轮转

## 📖 常见用途

### 个人文档库
```bash
./vmd ~/Documents/notes
```

### 项目文档预览
```bash
./vmd ~/my-project/docs
```

### 博客本地预览
```bash
./vmd ./content
```

### Docker 容器内运行
```bash
docker run -p 8888:8888 -v ~/docs:/markdown:ro vmd:latest
```

## ⚙️ 配置

### 启动参数
```bash
./vmd [directory] [port]

# 示例
./vmd ~/docs              # 目录模式，端口 8888
./vmd ~/file.md          # 单文件模式
./vmd ~/docs 9000        # 目录模式，端口 9000
```

### 环境变量
| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TZ` | UTC | 时区（Docker 中有效） |

### 前端偏好（localStorage）
| 键 | 说明 |
|----|------|
| `vmd_theme` | 主题（light/dark） |
| `vmd_folder_view_mode` | 文件夹视图模式 |
| `vmd_grid_card_size` | 网格卡片尺寸（S/M/L） |

## 🐛 故障排查

### Bun 路径问题
如果 `./vmd` 找不到 bun：
```bash
# 手动指定 bun 路径
/path/to/bun dist/cli.js ~/docs
```

### 编辑后文件不保存
检查文件权限和磁盘空间

### Docker 容器无法访问
查看日志：
```bash
docker logs vmd-server
```

### 端口被占用
使用其他端口：
```bash
./vmd ~/docs 9000
```

详见 [DOCKER.md - 故障排查](./DOCKER.md#故障排查)

## 📄 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 PR！

---

**最后更新**：2026 年 3 月  
**项目版本**：2.0.0
