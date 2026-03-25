#!/usr/bin/env node
/**
 * vmd-mcp-server
 *
 * MCP server for vmd shared file/folder API.
 * Connects AI agents to vmd share links for browsing directories,
 * reading files, and searching content - all read-only via share tokens.
 *
 * Configuration (environment variables):
 *   VMD_BASE_URL    - vmd server base URL, e.g. http://localhost:8197
 *   VMD_SHARE_TOKEN - share token from vmd (get from share dialog)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios, { AxiosError } from "axios";
import { z } from "zod";

// ============================================================
// Configuration
// ============================================================

const BASE_URL = process.env.VMD_BASE_URL?.replace(/\/$/, "") ?? "";
const SHARE_TOKEN = process.env.VMD_SHARE_TOKEN ?? "";
const CHARACTER_LIMIT = 25000;

function validateConfig(): void {
  const missing: string[] = [];
  if (!BASE_URL) missing.push("VMD_BASE_URL");
  if (!SHARE_TOKEN) missing.push("VMD_SHARE_TOKEN");
  if (missing.length > 0) {
    console.error(
      `ERROR: Missing required environment variables: ${missing.join(", ")}\n` +
      `  VMD_BASE_URL    - vmd server URL, e.g. http://localhost:8197\n` +
      `  VMD_SHARE_TOKEN - share token from the vmd share dialog`
    );
    process.exit(1);
  }
}

function shareApiUrl(path: string): string {
  return `${BASE_URL}/share/${SHARE_TOKEN}${path}`;
}

// ============================================================
// Types
// ============================================================

interface FileNode {
  name: string;
  type: "file" | "folder";
  path: string;
  size?: string;
  children?: FileNode[];
}

interface SearchMatch {
  lineNumber: number;
  lineContent: string;
}

interface SearchResult {
  filePath: string;
  fileName: string;
  matches: SearchMatch[];
}

// ============================================================
// Enums
// ============================================================

enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

// ============================================================
// HTTP client
// ============================================================

async function vmdGet<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const response = await axios.get<T>(shareApiUrl(path), {
    params,
    timeout: 15000,
    headers: { Accept: "application/json" },
  });
  return response.data;
}

async function vmdGetText(path: string): Promise<string> {
  const response = await axios.get<string>(shareApiUrl(path), {
    timeout: 15000,
    responseType: "text",
  });
  return response.data;
}

// ============================================================
// Error handling
// ============================================================

function handleError(error: unknown): string {
  if (error instanceof AxiosError) {
    const axiosErr = error as AxiosError;
    if (axiosErr.response) {
      switch (axiosErr.response.status) {
        case 410:
          return "Error: Share link has expired or does not exist. Ask the owner to generate a new share link.";
        case 403:
          return "Error: Access denied. This path is outside the shared scope.";
        case 404:
          return "Error: File or directory not found. Use vmd_list_files to browse available paths.";
        default:
          return `Error: API request failed with status ${axiosErr.response.status}`;
      }
    }
    if (axiosErr.code === "ECONNABORTED") {
      return "Error: Request timed out. The vmd server may be slow or unavailable.";
    }
    if (axiosErr.code === "ECONNREFUSED") {
      return `Error: Cannot connect to vmd server at ${BASE_URL}. Make sure the server is running.`;
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

// ============================================================
// Formatting helpers
// ============================================================

function renderTree(nodes: FileNode[], indent = 0): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const prefix = "  ".repeat(indent);
    const icon = node.type === "folder" ? "📁" : "📄";
    const size = node.size ? ` (${node.size})` : "";
    lines.push(`${prefix}${icon} ${node.name}${size}  [${node.path}]`);
    if (node.type === "folder" && node.children?.length) {
      lines.push(...renderTree(node.children, indent + 1));
    }
  }
  return lines.join("\n");
}

function truncate(text: string, source: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT) +
    `\n\n[Truncated: response exceeded ${CHARACTER_LIMIT} chars. ` +
    `Use more specific paths or search queries to narrow results from ${source}.]`
  );
}

// ============================================================
// MCP Server
// ============================================================

const server = new McpServer({
  name: "vmd-mcp-server",
  version: "1.0.0",
});

// ─────────────────────────────────────────────────────────────
// Tool: vmd_list_files
// ─────────────────────────────────────────────────────────────
server.registerTool(
  "vmd_list_files",
  {
    title: "List vmd Shared Files",
    description: `List the directory tree of a vmd shared folder.

Returns all files and subdirectories accessible through the current share token.
Folder shares expose the entire subtree; file shares only expose the single file.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')
    - markdown: Indented tree with icons and file sizes, suitable for reading
    - json: Raw FileNode array for programmatic processing

Returns (markdown):
  Indented tree like:
    📁 src  [src]
      📁 client  [src/client]
        📄 App.tsx (12.3K)  [src/client/App.tsx]

Returns (json):
  Array of FileNode objects:
  [{ "name": string, "type": "file"|"folder", "path": string, "size"?: string, "children"?: FileNode[] }]

Use vmd_read_file with the 'path' value to read any file.

Examples:
  - Use when: "What files are in the shared folder?" -> call with default params
  - Use when: "List all TypeScript files" -> call then filter by extension
  - Don't use when: You already know the exact file path (use vmd_read_file directly)`,
    inputSchema: z.object({
      response_format: z
        .nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' for human-readable or 'json' for raw data"),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ response_format }) => {
    try {
      const tree = await vmdGet<FileNode[]>("/api/files");

      if (response_format === ResponseFormat.JSON) {
        const text = truncate(JSON.stringify(tree, null, 2), "vmd_list_files");
        return {
          content: [{ type: "text", text }],
          structuredContent: { tree },
        };
      }

      const rendered = renderTree(tree);
      const text = truncate(
        `# Shared Files\n\n${rendered || "(empty)"}`,
        "vmd_list_files"
      );
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: handleError(error) }] };
    }
  }
);

// ─────────────────────────────────────────────────────────────
// Tool: vmd_read_file
// ─────────────────────────────────────────────────────────────
server.registerTool(
  "vmd_read_file",
  {
    title: "Read vmd Shared File",
    description: `Read the content of a file from the vmd share.

Returns the raw text content of the specified file.
For file shares, use the exact path shown in __VMD_SHARE_PATH__.
For folder shares, use relative paths as returned by vmd_list_files.

Args:
  - path (string): Relative file path within the share, e.g. "src/client/App.tsx"

Returns:
  Raw text content of the file (Markdown, code, plain text, etc.)

Error cases:
  - "File not found" -> Use vmd_list_files to find the correct path
  - "Share expired"  -> Ask the owner to regenerate the share link
  - "Access denied"  -> Path is outside the shared scope

Examples:
  - Use when: "Show me the README" -> path="README.md"
  - Use when: "Read the main server file" -> path="src/server/index.ts"
  - Don't use when: You need to search across files (use vmd_search instead)`,
    inputSchema: z.object({
      path: z
        .string()
        .min(1, "Path cannot be empty")
        .describe('Relative file path within the share, e.g. "src/index.ts" or "README.md"'),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ path }) => {
    try {
      const content = await vmdGetText(`/api/file/${encodeURIComponent(path)}`);
      const text = truncate(content, `vmd_read_file(${path})`);
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: handleError(error) }] };
    }
  }
);

// ─────────────────────────────────────────────────────────────
// Tool: vmd_search
// ─────────────────────────────────────────────────────────────
server.registerTool(
  "vmd_search",
  {
    title: "Search vmd Shared Files",
    description: `Search files in the vmd share by filename or content.

Two search modes:
  - name: Fast client-side filename matching (case-insensitive substring)
  - content: Full-text grep search across all text files (slower but thorough)

Args:
  - query (string): Search keyword or phrase
  - type ('name' | 'content'): Search mode (default: 'name')
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns (markdown):
  ## Results for 'query' (name/content search)
  Found N files

  ### filename.ts  [path/to/filename.ts]
  - Line 42: matching line content
  - Line 87: another matching line

Returns (json):
  Array of SearchResult:
  [{ "filePath": string, "fileName": string, "matches": [{ "lineNumber": number, "lineContent": string }] }]

Notes:
  - content search returns up to 3 matching lines per file
  - name search returns all matching files with empty matches array
  - Only available for folder shares; file shares return an error

Examples:
  - Use when: "Find all files named App" -> query="App", type="name"
  - Use when: "Find where ShareStore is used" -> query="ShareStore", type="content"
  - Use when: "Which files import React?" -> query="import React", type="content"
  - Don't use when: You know the exact path (use vmd_read_file instead)`,
    inputSchema: z.object({
      query: z
        .string()
        .min(1, "Query cannot be empty")
        .max(200, "Query must not exceed 200 characters")
        .describe('Search keyword or phrase, e.g. "ShareStore" or "import axios"'),
      type: z
        .enum(["name", "content"])
        .default("name")
        .describe("Search mode: 'name' for filename matching, 'content' for full-text grep"),
      response_format: z
        .nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' for human-readable or 'json' for raw data"),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ query, type, response_format }) => {
    try {
      const results = await vmdGet<SearchResult[]>("/api/search", { q: query, type });

      if (!results.length) {
        return {
          content: [{
            type: "text",
            text: `No files found matching '${query}' (${type} search). Try a different query or search type.`,
          }],
        };
      }

      if (response_format === ResponseFormat.JSON) {
        const text = truncate(JSON.stringify(results, null, 2), "vmd_search");
        return {
          content: [{ type: "text", text }],
          structuredContent: { results, total: results.length },
        };
      }

      const lines: string[] = [
        `## Results for '${query}' (${type} search)`,
        `Found ${results.length} file${results.length !== 1 ? "s" : ""}`,
        "",
      ];
      for (const r of results) {
        lines.push(`### ${r.fileName}  [${r.filePath}]`);
        if (r.matches.length > 0) {
          for (const m of r.matches) {
            lines.push(`- Line ${m.lineNumber}: ${m.lineContent}`);
          }
        }
        lines.push("");
      }

      const text = truncate(lines.join("\n"), "vmd_search");
      return {
        content: [{ type: "text", text }],
        structuredContent: { results, total: results.length },
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: handleError(error) }] };
    }
  }
);

// ============================================================
// Start
// ============================================================

async function main(): Promise<void> {
  validateConfig();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `vmd-mcp-server started\n` +
    `  Base URL: ${BASE_URL}\n` +
    `  Share:    ${BASE_URL}/share/${SHARE_TOKEN}`
  );
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
