# vmd-mcp-server

MCP server for vmd shared file/folder API. Lets AI agents browse directories, read files, and search content via vmd share links.

## Setup

### 1. Build

```bash
cd mcp-server
~/.bun/bin/bun install
~/.bun/bin/bun build src/index.ts --outdir dist --target bun
```

### 2. Create a share link in vmd

Open vmd, right-click a file or folder → Share, select expiry → copy the token from the generated URL.

### 3. Configure in CodeBuddy Code (`~/.codebuddy/settings.json`)

```json
{
  "mcpServers": {
    "vmd": {
      "command": "/Users/yedeying/.bun/bin/bun",
      "args": ["/Users/yedeying/Files/personal-doc/markdown-preview/mcp-server/dist/index.js"],
      "env": {
        "VMD_BASE_URL": "http://localhost:8197",
        "VMD_SHARE_TOKEN": "<your-share-token>"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `vmd_list_files` | List the full directory tree of the share |
| `vmd_read_file` | Read a file's content by relative path |
| `vmd_search` | Search by filename (`type=name`) or full-text grep (`type=content`) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VMD_BASE_URL` | Yes | vmd server URL, e.g. `http://localhost:8197` |
| `VMD_SHARE_TOKEN` | Yes | Share token from vmd share dialog |
