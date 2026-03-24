import { resolve } from 'path'
import { existsSync, statSync } from 'fs'
import { startServer } from './server/index.js'

// import.meta.dir 在 Bun 构建产物中返回当前文件所在目录（dist/）
const __dirname: string = (import.meta as Record<string, unknown>).dir as string
  ?? resolve(new URL(import.meta.url).pathname, '..')

const HELP = `
用法: vmd <Markdown文件或目录>

  如果参数是文件:  预览该 Markdown 文件（支持热更新 + 编辑保存）
  如果参数是目录:  启动文件浏览器（支持全文搜索 + 编辑保存）

选项:
  -h, --help        显示帮助信息
  -p, --port <n>    指定端口号（默认 8888）

示例:
  vmd README.md
  vmd ./docs/
  vmd . --port 9000
`

function parseArgs(argv: string[]): { path: string; port: number } | null {
  const args = argv.slice(2)

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(HELP)
    process.exit(args.length === 0 ? 1 : 0)
  }

  let port = 8888
  let pathArg = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-p' || args[i] === '--port') {
      port = parseInt(args[i + 1] ?? '8888')
      i++
    } else {
      pathArg = args[i]
    }
  }

  if (!pathArg) {
    console.error('\x1b[31m错误: 请指定 Markdown 文件或目录\x1b[0m')
    process.exit(1)
  }

  return { path: pathArg, port }
}

async function main() {
  const parsed = parseArgs(process.argv)
  if (!parsed) return

  const { path: inputPath, port } = parsed
  const absPath = resolve(inputPath)

  if (!existsSync(absPath)) {
    console.error(`\x1b[31m错误: 路径 '${inputPath}' 不存在\x1b[0m`)
    process.exit(1)
  }

  const stat = statSync(absPath)
  const distPath = resolve(__dirname, 'client')

  if (!existsSync(distPath)) {
    console.error(`\x1b[31m错误: 构建产物不存在 (${distPath})\x1b[0m`)
    console.error('\x1b[33m请先运行: bun run build\x1b[0m')
    process.exit(1)
  }

  if (stat.isDirectory()) {
    console.log(`\x1b[34m📁 目录模式: ${absPath}\x1b[0m`)
    await startServer({
      mode: 'dir',
      basePath: absPath,
      port,
      distPath,
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
      distPath,
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
