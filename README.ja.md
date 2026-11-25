<div align="center">

# vmd · Markdown Browser

**ライブ編集、Finder 風のマルチビュー、リアルタイム同期、拡張プラグインシステムを備えた高速・セルフホスト型 Markdown ＆ メディアブラウザ。**

<p>
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <strong>日本語</strong>
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
  <a href="#-主な機能">主な機能</a> ·
  <a href="#-クイックスタート">クイックスタート</a> ·
  <a href="#-docker-デプロイ">Docker</a> ·
  <a href="#-プラグインシステム">プラグイン</a> ·
  <a href="#-キーボードショートカット">ショートカット</a> ·
  <a href="#-api-リファレンス">API</a> ·
  <a href="#-開発とテスト">開発とテスト</a>
</p>

</div>

---

## ✨ 主な機能

### 📝 Markdown ＆ リッチドキュメント閲覧
- **GFM ＆ 拡張レンダリング**：`marked`、`highlight.js`（35 以上の言語）、**KaTeX** 数式（`$...$` / `$$...$$`）、**Mermaid 11** ダイアグラムに対応。
- **快適な閲覧体験**：YAML Frontmatter メタデータ表、見出し折りたたみ、目次（TOC）、ソート可能なテーブル、インタラクティブなチェックボックス、印刷対応スタイル。
- **インライン画像ライトボックス**：Markdown 内の画像をクリックするとビューポートに最適化したフルスクリーン Lightbox を表示。拡大・縮小・フィット・90° 回転・ダウンロード・パスコピー・左右切替に加え、画面左/中/右の 3 分割タップ操作とモバイル標準ジェスチャー競合の完全ガードを備えています。

### ✏️ ライブ編集 ＆ コードビューア
- **CodeMirror 6 エディタ**：Markdown の分割ライブプレビュー編集と、35 以上の言語（ファイル名・shebang 自動判別含む）のシンタックスハイライト編集に対応。
- **Prettier 3 フォーマット**：Markdown をワンクリックで整形。
- **安全な外部変更検知**：SSE でディスク上の変更を検知し、未保存の編集がある場合は上書きせず更新バナーで通知します。

### 🖼️ ビルトイン・マルチフォーマットプレビュー
| フォーマット | ビルトインプラグイン | 主な機能 |
| :--- | :--- | :--- |
| **Markdown** (`.md`, `.markdown`) | `builtin.markdown` | リッチ表示、分割ライブ編集、TOC、見出し折りたたみ、画像 Lightbox |
| **PDF** (`.pdf`) | `builtin.pdf` | フルハイト埋め込みプレビュー、新規タブで開く、ダウンロード、カラムプレビュー |
| **画像** (`.png`, `.jpg`, `.webp`, `.gif`, `.svg`, `.heic`/`.heif` 等) | `builtin.image` | ズーム/フィット/90° 回転、`Ctrl/Cmd`+ホイール拡大縮小、HEIC 自動変換、Lightbox |
| **動画** (`.mp4`, `.webm`, `.mov`, `.ogg`, `.avi`) | `builtin.video` | HTTP `Range` ストリーミング再生、ポスターサムネイル生成 |
| **HTML ＆ 静的サイト** (`.html`、`index.html` を含むフォルダ) | `builtin.html`, `builtin.site-folder` | 独立プレビューおよび `/site/` 静的サイト配信 |
| **JSONL / コード / テキスト** (`.jsonl`, `.ts`, `.py`, `.json`, `.txt` 等) | `builtin.jsonl`, `builtin.code`, `builtin.plaintext` | JSONL 構造化ビュー、コードハイライト、UTF-8/UTF-16/GBK 自動デコード |

### 📂 Finder 風フォルダブラウジング
- **4 種類のビューモード**：
  - **リストビュー** — ソート可能な高密度ファイル一覧。
  - **グリッドビュー** — S / M / L サイズ切替とメディアサムネイル表示。
  - **カラムビュー** — macOS Finder 風のマルチカラム表示。階層が深くなると古い親カラムを左へ自動で隠し、右側のプレビュー領域を常に広く確保します（`←`/`→` キー操作も一貫）。
  - **メイソンリーギャラリー** — サブフォルダ内の画像・動画を再帰的に集約し、遅延サムネイルと Lightbox で快適に閲覧。
- **ファイル操作**：新規作成、リネーム、フォルダ間コピー/カット/ペースト、ドラッグ＆ドロップアップロード（フォルダ対応）、単体・複数 ZIP ダウンロード、隠しファイル切替、パンくずナビゲーション。
- **高速検索**：ファイル名検索およびサーバーサイド `grep` 全文検索。

### ⚡ リアルタイム同期・マルチマウント・共有
- **オンデマンド監視（フルスキャン不要）**：SSE（`/api/watch` + `/api/watch/sync`）で現在表示中のディレクトリのみを監視し、切断猶予（15 秒）と再接続・タブ復帰時の `mtimeMs` 差分チェックにより大規模 NAS でも軽快に動作。
- **ディープリンク高速化**：ファイル直リンク時は本文、`/api/stat`、外部プラグイン、親ディレクトリ階層を並列フェッチ。
- **3 つの起動モード**：単一ファイルモード、ディレクトリモード、`--workspace` マルチマウントモード（`/m/<alias>/...` + `/admin` 管理画面）。
- **共有リンク ＆ 認証**：任意のファイル・フォルダに対して読み取り専用共有リンク（`/share/<token>`）を発行でき、`-P` / `VMD_PASSWORD` でパスワード保護も可能。

---

## 🚀 クイックスタート

### 動作要件
- **[Bun](https://bun.sh/)** `v1.0+`
- **Docker**（コンテナ運用時のみ）

### ソースから実行

```bash
git clone https://github.com/yedeying/markdown-browser.git
cd markdown-browser

# 依存関係のインストールとビルド
bun install
bun run build

# ディレクトリモード（デフォルトポート 8888）
./vmd ~/docs

# 単一ファイルモード
./vmd ~/notes/README.md

# ポートとパスワードを指定
./vmd ~/docs --port 9000 --password secret

# マルチマウント・ワークスペースモード
./vmd --workspace /workspace \
  --mount docs:Docs:docs \
  --mount notes:Notes:personal-notes
```

ブラウザで `http://localhost:8888` を開いてください。

---

## 🐳 Docker デプロイ

`v*` タグのリリースごとにマルチアーキテクチャ対応イメージが GHCR に公開されます：

```
ghcr.io/yedeying/markdown-browser:latest
```

### クイック起動

```bash
docker run -d \
  --name vmd-server \
  -p 8888:8888 \
  -v /path/to/your/docs:/workspace \
  -e TZ=Asia/Tokyo \
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
      # オプション：外部ランタイムプラグインをマウント
      # - ./plugins:/plugins:ro
    environment:
      TZ: Asia/Tokyo
      # VMD_PASSWORD: "change-me"
      # VMD_PLUGINS_DIR: "/plugins"
      # VMD_IMAGE_TRANSFORM: "0"
      # VMD_MASONRY_RECURSE_DEPTH: "3"
```

詳細は [DOCKER.md](./DOCKER.md) をご覧ください。

---

## ⚙️ CLI オプション ＆ 環境変数

### CLI オプション

| オプション | デフォルト | 説明 |
| :--- | :--- | :--- |
| `<path>` | — | 対象ファイル（単一ファイルモード）またはディレクトリ |
| `-p, --port <n>` | `8888` | HTTP リッスンポート |
| `--host <host>` | `0.0.0.0` | バインドアドレス |
| `-P, --password <pw>` | — | パスワード認証を有効化（`VMD_PASSWORD` より優先） |
| `--workspace <dir>` | — | マルチマウントモードを有効化（`<workspace>/.vmd-config.json`） |
| `--mount <alias>:<name>:<subpath>` | — | マウントポイントを追加（複数指定可、`--workspace` 時のみ） |
| `--plugins <dir>` | `<root>/.vmd-plugins` | 外部ランタイムプラグインディレクトリ |
| `-h, --help` | — | ヘルプを表示 |

### 環境変数

| 変数 | デフォルト | 説明 |
| :--- | :--- | :--- |
| `VMD_PASSWORD` | — | Web UI / API のアクセスパスワード |
| `VMD_PLUGINS_DIR` | — | 外部ランタイムプラグインのディレクトリパス |
| `VMD_IMAGE_TRANSFORM` | `0`（Docker）/ `1`（ローカル） | リアルタイム画像リサイズ/変換の有効化（HEIC は常に変換） |
| `VMD_MASONRY_RECURSE_DEPTH` | `3` | メイソンリーギャラリーの再帰探索深さ |
| `TZ` | `UTC` | コンテナのタイムゾーン |

---

## 🧩 プラグインシステム

`vmd` は再ビルド不要の外部ランタイムプラグインをサポートしています。`--plugins <dir>`（または `<workspace>/.vmd-plugins`）配下にプラグインごとのサブディレクトリを配置するだけで自動読み込みされます：

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

**`index.js`**（ネイティブ ESM、Preact `h` や `hooks` を含むランタイム `sdk` を受け取ります）:
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

---

## ⌨️ キーボードショートカット

| コンテキスト | キー | 操作 |
| :--- | :--- | :--- |
| **サイドバー / フォルダビュー** | `↑` / `↓` または `k` / `j` | カーソルを上下移動 |
| **サイドバー / カラムビュー** | `→` / `l` または `Enter` | フォルダを開く / プレビューにフォーカス / ファイルを開く |
| **サイドバー / カラムビュー** | `←` / `h` | 親カラムへ戻る / サイドバーへフォーカスを戻す |
| **カラムプレビュー選択時** | `↑` / `↓` | プレビュー内容をスクロール |
| **画像 Lightbox** | `←` / `→` または `h` / `l` | 前 / 次のメディアへ移動 |
| **画像 Lightbox** | `Esc` | Lightbox を閉じる |
| **画像 Lightbox** | `Ctrl` / `Cmd` + ホイール | 拡大 / 縮小 |
| **画像 Lightbox（タップ / クリック）** | 画面 左 / 中央 / 右 の 1/3 | 前へ / ツールバー表示切替 / 次へ |

---

## 🔌 API リファレンス

> マルチマウントモードでは `/m/<alias>` プレフィックスを付与します（例：`/m/docs/api/files`）。

| メソッド | エンドポイント | 説明 |
| :--- | :--- | :--- |
| `GET` | `/api/files?path=<dir>&depth=1&showHidden=0` | ディレクトリ直下のノードを遅延取得 |
| `GET` | `/api/stat?path=<path>` | ファイル・ディレクトリのメタ情報を取得 |
| `GET` | `/api/file/<path>` | テキスト内容を取得（UTF-8 / UTF-16 / GBK 自動判定） |
| `POST` | `/api/save/<path>` | テキストを保存（バイナリ拡張子は拒否） |
| `GET` | `/api/asset/<path>[?w=&fmt=&poster=1]` | 静的アセット・サムネイル・動画ポスター配信（Range 対応） |
| `GET` | `/api/search?q=<kw>&type=name\|content` | ファイル名検索 / 全文検索 |
| `GET` | `/api/download/<path>` | 単一ファイルダウンロード |
| `POST` | `/api/download/zip` | 複数ファイル・フォルダの ZIP 一括ダウンロード |
| `POST` | `/api/upload` | ファイル / フォルダのアップロード |
| `GET` | `/api/watch?clientId=<id>` | SSE 変更通知（`tree-change` / `reload`） |
| `POST` | `/api/watch/sync` | 表示中ディレクトリ一覧をサーバー監視へ同期 |
| `POST` | `/api/files/check-mtime` | 表示中ディレクトリの `mtimeMs` 一括差分チェック |
| `GET` | `/api/plugins` | 外部ランタイムプラグイン一覧を取得 |
| `GET` | `/site/<dir>/<entry>` | 静的 HTML フォルダの直接配信 |

---

## 🧪 開発とテスト

```bash
# Vite 開発サーバー起動
bun run dev

# ユニットテスト実行（450+ テスト / bun:test）
bun test

# Playwright E2E テスト実行
bun run test:e2e

# 本番ビルド（フロントエンド -> dist/client/、サーバー -> dist/cli.js）
bun run build
```

---

## 🤝 コントリビューション

バグ報告や機能提案は [Issues](https://github.com/yedeying/markdown-browser/issues) または Pull Request からお気軽にどうぞ！

## 📄 ライセンス

[MIT License](https://opensource.org/licenses/MIT) の下で公開されています。
