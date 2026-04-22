import { resolve } from 'path'
import { existsSync, statSync } from 'fs'
import { startServer } from './server/index.js'
import type { MountConfig } from './types.js'

// import.meta.dir 在 Bun 构建产物中返回当前文件所在目录（dist/）
const __dirname: string = (import.meta as Record<string, unknown>).dir as string
  ?? resolve(new URL(import.meta.url).pathname, '..')

const HELP = `
用法:
  vmd <文件或目录>                       预览单文件或目录
  vmd --workspace <工作区目录>           多挂载模式（从 <workspace>/.vmd-config.json 加载配置）

选项:
  -h, --help                            显示帮助信息
  -p, --port <n>                        指定端口号（默认 8888）
  --host <host>                         绑定主机（默认 0.0.0.0）
  -P, --password <pw>                   访问密码（也可用 VMD_PASSWORD 环境变量）
  --admin-password <pw>                 管理员密码，用于在线编辑挂载点（VMD_ADMIN_PASSWORD 环境变量）
  --workspace <dir>                     工作区根目录（多挂载模式）
  --mount <alias>:<name>:<subpath>      追加挂载点（可多次使用），仅 --workspace 模式有效

示例:
  vmd README.md
  vmd ./docs/ --port 9000
  vmd --workspace /workspace --admin-password admin123
  vmd --workspace /workspace --mount work:工作:work --mount notes:笔记:personal-doc
`

interface ParsedArgs {
  path?: string
  workspace?: string
  mounts: MountConfig[]
  port: number
  host: string
  password?: string
  adminPassword?: string
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const args = argv.slice(2)

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(HELP)
    process.exit(args.length === 0 ? 1 : 0)
  }

  let port = 8888
  let host = '0.0.0.0'
  let pathArg: string | undefined
  let workspace: string | undefined
  const mounts: MountConfig[] = []

  let password: string | undefined = process.env.VMD_PASSWORD !== undefined
    ? process.env.VMD_PASSWORD
    : undefined
  let adminPassword: string | undefined = process.env.VMD_ADMIN_PASSWORD !== undefined
    ? process.env.VMD_ADMIN_PASSWORD
    : undefined

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-p' || a === '--port') {
      port = parseInt(args[++i] ?? '8888')
    } else if (a === '--host') {
      host = args[++i] ?? '0.0.0.0'
    } else if (a === '-P' || a === '--password') {
      password = args[++i] ?? ''
    } else if (a === '--admin-password') {
      adminPassword = args[++i] ?? ''
    } else if (a === '--workspace') {
      workspace = args[++i]
    } else if (a === '--mount') {
      // 格式：alias:name:path  （name 可省略，冒号仍需保留：alias::path）
      const spec = args[++i] ?? ''
      const parts = spec.split(':')
      if (parts.length < 2) {
        console.error(`\x1b[31m错误: --mount 格式应为 alias:name:path 或 alias:path\x1b[0m`)
        process.exit(1)
      }
      let alias: string, name: string, mpath: string
      if (parts.length === 2) {
        alias = parts[0]
        name = parts[0]
        mpath = parts[1]
      } else {
        alias = parts[0]
        name = parts[1] || parts[0]
        mpath = parts.slice(2).join(':')
      }
      mounts.push({ alias, name, path: mpath })
    } else if (!a.startsWith('-')) {
      pathArg = a
    }
  }

  if (password !== undefined && password.trim() === '') {
    console.error('\x1b[31m错误: 密码不能为空\x1b[0m')
    process.exit(1)
  }
  if (adminPassword !== undefined && adminPassword.trim() === '') {
    console.error('\x1b[31m错误: 管理员密码不能为空\x1b[0m')
    process.exit(1)
  }

  if (!pathArg && !workspace) {
    console.error('\x1b[31m错误: 请指定文件/目录，或使用 --workspace 启用多挂载模式\x1b[0m')
    process.exit(1)
  }

  return { path: pathArg, workspace, mounts, port, host, password, adminPassword }
}

async function main() {
  const parsed = parseArgs(process.argv)
  if (!parsed) return

  const { path: inputPath, workspace, mounts, port, host, password, adminPassword } = parsed
  const distPath = resolve(__dirname, 'client')

  if (!existsSync(distPath)) {
    console.error(`\x1b[31m错误: 构建产物不存在 (${distPath})\x1b[0m`)
    console.error('\x1b[33m请先运行: bun run build\x1b[0m')
    process.exit(1)
  }

  // 多挂载模式优先
  if (workspace) {
    const wsAbs = resolve(workspace)
    if (!existsSync(wsAbs)) {
      console.error(`\x1b[31m错误: 工作区不存在: ${wsAbs}\x1b[0m`)
      process.exit(1)
    }
    const st = statSync(wsAbs)
    if (!st.isDirectory()) {
      console.error(`\x1b[31m错误: 工作区不是目录: ${wsAbs}\x1b[0m`)
      process.exit(1)
    }
    console.log(`\x1b[34m🗂  多挂载模式: workspace=${wsAbs}\x1b[0m`)
    await startServer({
      mode: 'multi',
      workspace: wsAbs,
      mounts,
      port,
      host,
      distPath,
      password,
      adminPassword,
    })
    return
  }

  // 单文件 / 单目录模式（向后兼容）
  const absPath = resolve(inputPath!)
  if (!existsSync(absPath)) {
    console.error(`\x1b[31m错误: 路径 '${inputPath}' 不存在\x1b[0m`)
    process.exit(1)
  }
  const stat = statSync(absPath)

  if (stat.isDirectory()) {
    console.log(`\x1b[34m📁 目录模式: ${absPath}\x1b[0m`)
    await startServer({
      mode: 'dir',
      basePath: absPath,
      port,
      host,
      distPath,
      password,
    })
  } else if (stat.isFile()) {
    const ext = absPath.toLowerCase()
    if (!ext.endsWith('.md') && !ext.endsWith('.markdown')) {
      console.error(`\x1b[31m错误: '${inputPath}' 不是 Markdown 文件\x1b[0m`)
      process.exit(1)
    }
    console.log(`\x1b[34m📄 单文件模式: ${absPath}\x1b[0m`)
    await startServer({
      mode: 'single',
      basePath: absPath,
      port,
      host,
      distPath,
      password,
    })
  } else {
    console.error(`\x1b[31m错误: '${inputPath}' 不是有效的文件或目录\x1b[0m`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('\x1b[31m错误:', e.message, '\x1b[0m')
  process.exit(1)
})
