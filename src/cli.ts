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
  -h, --help              显示帮助信息
  -p, --port <n>          指定端口号（默认 8888）
  --host <host>           指定绑定主机（默认 0.0.0.0）
  -P, --password <pw>     设置访问密码（也可用 VMD_PASSWORD 环境变量）

示例:
  vmd README.md
  vmd ./docs/
  vmd . --port 9000
`

function parseArgs(argv: string[]): { path: string; port: number; host: string; password?: string } | null {
  const args = argv.slice(2)

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(HELP)
    process.exit(args.length === 0 ? 1 : 0)
  }

  let port = 8888
  let host = '0.0.0.0'
  let pathArg = ''
  // 优先读取环境变量，命令行参数可覆盖
  let password: string | undefined = process.env.VMD_PASSWORD !== undefined
    ? process.env.VMD_PASSWORD
    : undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-p' || args[i] === '--port') {
      port = parseInt(args[i + 1] ?? '8888')
      i++
    } else if (args[i] === '--host') {
      host = args[i + 1] ?? '0.0.0.0'
      i++
    } else if (args[i] === '-P' || args[i] === '--password') {
      password = args[i + 1] ?? ''
      i++
    } else {
      pathArg = args[i]
    }
  }

  // 密码为空（环境变量或命令行均不允许空值）→ 报错
  if (password !== undefined && password.trim() === '') {
    console.error('\x1b[31m错误: 密码不能为空，请指定一个有效密码\x1b[0m')
    console.error('\x1b[33m  示例: vmd ~/docs --password mypassword\x1b[0m')
    console.error('\x1b[33m  或者: VMD_PASSWORD=mypassword vmd ~/docs\x1b[0m')
    process.exit(1)
  }

  if (!pathArg) {
    console.error('\x1b[31m错误: 请指定 Markdown 文件或目录\x1b[0m')
    process.exit(1)
  }

  return { path: pathArg, port, host, password }
}

async function main() {
  const parsed = parseArgs(process.argv)
  if (!parsed) return

  const { path: inputPath, port, host, password } = parsed
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
