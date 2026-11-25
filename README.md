<div align="center">

# vmd · Markdown Browser

**A fast, self-hosted Markdown & media browser with live editing, Finder-style views, real-time sync, and an extensible plugin system.**

<p>
  <strong>English</strong> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
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
  <a href="#-features">Features</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-docker-deployment">Docker</a> ·
  <a href="#-plugin-system">Plugins</a> ·
  <a href="#-keyboard-shortcuts">Shortcuts</a> ·
  <a href="#-api-reference">API</a> ·
  <a href="#-development">Development</a>
</p>

</div>

---

## ✨ Features

### 📝 Markdown & Rich Document Reading
- **Full GFM & Rich Extensions**: Powered by `marked`, `highlight.js` (35+ languages), **KaTeX** math (`$...$` / `$$...$$`), and **Mermaid 11** diagrams.
- **Structured Reading Aids**: Automatic YAML Frontmatter metadata table, collapsible heading sections, floating Table of Contents (TOC), sortable Markdown tables, interactive task checkboxes, and print-friendly styling.
- **Inline Image Lightbox**: Click any image inside a Markdown document to open a full-screen Lightbox fitted to the viewport with zoom, fit, 90° rotation, download, copy path, keyboard navigation, 3-zone tap switching (left / center / right), and mobile gesture isolation.

### ✏️ Live Editing & Code Viewing
- **CodeMirror 6 Editor**: Split-screen live preview for Markdown and full-screen editing for 35+ code languages (with automatic basename & shebang detection).
- **One-Click Formatting**: Integrated **Prettier 3** formatting for Markdown.
- **Safe External Sync**: Detects on-disk changes via SSE and shows a non-destructive update banner when unsaved local edits exist.

### 🖼️ Built-in Multi-Format Previewers
| Format | Built-in Plugin | Capabilities |
| :--- | :--- | :--- |
| **Markdown** (`.md`, `.markdown`) | `builtin.markdown` | Rich preview, split live edit, TOC, heading folds, inline image Lightbox |
| **PDF** (`.pdf`) | `builtin.pdf` | Full-height embedded viewer, open in new tab, download, Finder column preview |
| **Images** (`.png`, `.jpg`, `.webp`, `.gif`, `.svg`, `.heic`/`.heif`, ...) | `builtin.image` | Zoom, fit, quarter-turn rotation, `Ctrl/Cmd`+wheel zoom, HEIC transcoding, Lightbox |
| **Videos** (`.mp4`, `.webm`, `.mov`, `.ogg`, `.avi`) | `builtin.video` | HTTP `Range` streaming, poster thumbnail extraction |
| **HTML & Static Sites** (`.html`, folders with `index.html`) | `builtin.html`, `builtin.site-folder` | Isolated preview & `/site/` static folder serving |
| **JSONL / Code / Text** (`.jsonl`, `.ts`, `.py`, `.json`, `.txt`, ...) | `builtin.jsonl`, `builtin.code`, `builtin.plaintext` | Structured JSONL viewer, syntax-highlighted editor, UTF-8/UTF-16/GBK decoding |

### 📂 Finder-Style File & Folder Management
- **4 Folder Views**:
  - **List View** — dense sortable table with metadata.
  - **Grid View** — S / M / L cards with media thumbnails.
  - **Column View** — macOS Finder-style Miller columns that automatically hide older ancestor columns to the left so the preview pane always keeps generous reading space, with consistent `←`/`→` keyboard navigation.
  - **Masonry Gallery** — recursive image & video waterfall gallery with lazy thumbnails and full-screen Lightbox.
- **File Operations**: Create file/folder, rename, copy/cut/paste across folders, drag-and-drop upload (files & nested folders), single-file or multi-selection ZIP download, hidden files toggle, and breadcrumb navigation.
- **Fast Search**: Instant filename search and server-side content `grep` search.

### ⚡ Real-Time Sync, Workspaces & Sharing
- **On-Demand File Watching**: Visible-directory explicit watch sync over SSE (`/api/watch` + `/api/watch/sync`), 15s disconnect grace period, and `mtimeMs` incremental refresh on reconnect or tab focus — no expensive full-disk scans.
- **Fast Deep-Link Loading**: Direct file URLs load content, metadata, external plugins, and ancestor tree levels concurrently.
- **3 Operating Modes**: Single-file preview, single-directory browser, and `--workspace` multi-mount mode (`/m/<alias>/...`) with a built-in `/admin` panel.
- **Share Links & Auth**: Generate read-only share links (`/share/<token>`) for any file or folder, and optionally protect the instance with `-P` / `VMD_PASSWORD`.

---

## 🚀 Quick Start

### Prerequisites
- **[Bun](https://bun.sh/)** `v1.0+` (used as both runtime and bundler)
- **Docker** (optional, for containerized deployment)

### Run from Source

```bash
git clone https://github.com/yedeying/markdown-browser.git
cd markdown-browser

# Install dependencies and build client + server
bun install
bun run build

# Directory mode (default port 8888)
./vmd ~/docs

# Single-file mode
./vmd ~/notes/README.md

# Custom port & password
./vmd ~/docs --port 9000 --password secret

# Multi-mount workspace mode
./vmd --workspace /workspace \
  --mount docs:Docs:docs \
  --mount notes:Notes:personal-notes
```

Open `http://localhost:8888` in your browser.

---

## 🐳 Docker Deployment

Prebuilt multi-arch images are published to GitHub Container Registry on every `v*` release:

```
ghcr.io/yedeying/markdown-browser:latest
```

### Quick Run

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
      # Optional: mount external runtime plugins
      # - ./plugins:/plugins:ro
    environment:
      TZ: UTC
      # VMD_PASSWORD: "change-me"
      # VMD_PLUGINS_DIR: "/plugins"
      # VMD_IMAGE_TRANSFORM: "0"
      # VMD_MASONRY_RECURSE_DEPTH: "3"
```

See [DOCKER.md](./DOCKER.md) for advanced deployment, reverse proxy, and troubleshooting guides.

---

## ⚙️ CLI Options & Environment Variables

### CLI Flags

| Flag | Default | Description |
| :--- | :--- | :--- |
| `<path>` | — | Target file (single-file mode) or directory (directory mode) |
| `-p, --port <n>` | `8888` | HTTP listen port |
| `--host <host>` | `0.0.0.0` | Bind address |
| `-P, --password <pw>` | — | Enable password login (overrides `VMD_PASSWORD`) |
| `--workspace <dir>` | — | Enable multi-mount workspace mode (`<workspace>/.vmd-config.json`) |
| `--mount <alias>:<name>:<subpath>` | — | Register a mount point under `--workspace` (repeatable) |
| `--plugins <dir>` | `<root>/.vmd-plugins` | Directory containing external runtime plugins |
| `-h, --help` | — | Show CLI help |

### Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `VMD_PASSWORD` | — | Access password for the web UI and API |
| `VMD_PLUGINS_DIR` | — | Path to external runtime plugins directory |
| `VMD_IMAGE_TRANSFORM` | `0` (Docker) / `1` (local) | Enable/disable optional on-the-fly image resizing/transcoding (HEIC always transcodes) |
| `VMD_MASONRY_RECURSE_DEPTH` | `3` | Maximum recursion depth for Masonry gallery view |
| `TZ` | `UTC` | Container timezone |

---

## 🧩 Plugin System

`vmd` supports zero-rebuild external runtime plugins. Place each plugin in its own subdirectory under `--plugins <dir>` (or `<workspace>/.vmd-plugins`):

```
.vmd-plugins/
└── my-custom-viewer/
    ├── plugin.json
    ├── index.js
    └── style.css
```

**`plugin.json`**:
```json
{
  "id": "ext.my-custom-viewer",
  "name": "My Custom Viewer",
  "entry": "index.js",
  "styles": ["style.css"]
}
```

**`index.js`** (native ESM, receives the runtime `sdk` with Preact `h`, `hooks`, and utilities):
```js
export default function createPlugin(sdk) {
  const { h } = sdk
  return {
    id: 'ext.my-custom-viewer',
    name: 'My Custom Viewer',
    priority: 100,
    target: 'file',
    matchPath: ({ ext }) => ext === '.log',
    sniffAndParse: ({ content }) => content.startsWith('CUSTOM:') ? { raw: content } : null,
    renderMain: ({ parsed }) => h('pre', { class: 'my-viewer' }, parsed.raw),
  }
}
```

Plugins are discovered via `GET /api/plugins`, served with cache-busting `?v=<mtime>` query strings, and hot-loaded without blocking initial page render.

---

## ⌨️ Keyboard Shortcuts

| Context | Key | Action |
| :--- | :--- | :--- |
| **Sidebar / Folder Views** | `↑` / `↓` or `k` / `j` | Move cursor up / down |
| **Sidebar / Column View** | `→` / `l` or `Enter` | Enter folder / focus preview / open file |
| **Sidebar / Column View** | `←` / `h` | Step back to parent column or return focus to sidebar |
| **Column Preview Focus** | `↑` / `↓` | Scroll preview content |
| **Image Lightbox** | `←` / `→` or `h` / `l` | Previous / next media |
| **Image Lightbox** | `Esc` | Close Lightbox |
| **Image Lightbox** | `Ctrl` / `Cmd` + Scroll | Zoom in / out |
| **Image Lightbox (Touch / Click)** | Left / Center / Right 1/3 | Previous / Toggle toolbar / Next |

---

## 🔌 API Reference

> In multi-mount mode, prefix endpoints with `/m/<alias>` (e.g. `/m/docs/api/files`).

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/files?path=<dir>&depth=1&showHidden=0` | List directory children (lazy 1-level) |
| `GET` | `/api/stat?path=<path>` | Stat a relative file or directory path |
| `GET` | `/api/file/<path>` | Read text file content (auto-decodes UTF-8/UTF-16/GBK) |
| `POST` | `/api/save/<path>` | Save text file content (rejects binary extensions) |
| `GET` | `/api/asset/<path>[?w=&fmt=&poster=1]` | Serve static asset, transcoded thumbnail, or video poster (Range supported) |
| `GET` | `/api/search?q=<kw>&type=name\|content` | Search by filename or file content |
| `GET` | `/api/download/<path>` | Download a single file as attachment |
| `POST` | `/api/download/zip` | Download multiple files/folders as a ZIP archive |
| `POST` | `/api/upload` | Upload files or folder structures |
| `GET` | `/api/watch?clientId=<id>` | SSE stream for `tree-change` and `reload` events |
| `POST` | `/api/watch/sync` | Sync client's currently visible directories to server watcher |
| `POST` | `/api/files/check-mtime` | Batch-check directory `mtimeMs` for incremental catch-up |
| `GET` | `/api/plugins` | Discover external runtime plugins |
| `GET` | `/site/<dir>/<entry>` | Serve static HTML folder directly |

---

## 🏗️ Architecture & Project Structure

```
markdown-browser/
├── src/
│   ├── cli.ts                    # CLI entry point & argument parser
│   ├── types.ts                  # Shared TypeScript interfaces
│   ├── client/                   # Frontend (Preact 10 + TypeScript + Vite)
│   │   ├── main.tsx              # App boot & appearance/plugin initialization
│   │   ├── App.tsx               # Routing (single / dir / multi-mount) & deep-link loader
│   │   ├── components/           # Sidebar, ContentArea, Folder*View, Editor, MediaLightbox, PdfViewer...
│   │   ├── hooks/                # useFileTree, useFileContent, useSSE, useSearch, useTheme...
│   │   ├── plugins/              # PluginRegistry, runtime loader, SDK, and builtin/* plugins
│   │   ├── utils/                # Markdown parser, fileType, columnStack, keyboardNav, fsApi...
│   │   └── styles/               # Modular CSS (themes, layout, components, markdown, print)
│   └── server/                   # Backend (Bun + Hono 4)
│       ├── index.ts              # Server bootstrap & middleware
│       ├── watcher.ts            # On-demand directory watcher & SSE broadcaster
│       ├── mount-manager.ts      # Multi-mount config persistence
│       ├── image-transform.ts    # Sharp + HEIC image transcoding
│       ├── plugins.ts            # External plugin discovery & asset serving
│       ├── share.ts              # Share token management & read-only routes
│       └── routes/               # dir, single, admin, auth routes
├── tests/
│   ├── e2e/                      # Playwright end-to-end test suite
│   └── fixtures/                 # Test fixture workspace
├── Dockerfile                    # Multi-stage production image
└── .github/workflows/            # CI (unit + build + E2E) & Release (GHCR publish)
```

---

## 🧪 Development & Testing

```bash
# Start Vite dev server
bun run dev

# Run unit tests (450+ tests via bun:test)
bun test

# Run Playwright E2E tests
bun run test:e2e

# Production build (client -> dist/client/, server -> dist/cli.js)
bun run build
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an [Issue](https://github.com/yedeying/markdown-browser/issues) or submit a Pull Request.

## 📄 License

Distributed under the [MIT License](https://opensource.org/licenses/MIT).
