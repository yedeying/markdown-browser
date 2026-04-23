import type { Context, Next } from 'hono'
import type { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { AuthConfig } from '../types.js'

// ============================================================
// 常量
// ============================================================

const COOKIE_NAME = 'vmd_session'
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000  // 15 分钟
const RESPONSE_DELAY_MS = 200

// ============================================================
// 暴力破解防护（内存）
// ============================================================

interface RateLimitEntry {
  count: number
  lockedUntil: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

// 每 5 分钟清理已解锁且无失败记录的条目
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (entry.lockedUntil < now && entry.count === 0) {
      rateLimitMap.delete(ip)
    }
  }
}, 5 * 60 * 1000)

function isRateLimited(ip: string): boolean {
  const entry = rateLimitMap.get(ip)
  if (!entry) return false
  if (entry.lockedUntil > 0 && Date.now() < entry.lockedUntil) return true
  // 锁定已过期，清除
  if (entry.lockedUntil > 0) rateLimitMap.delete(ip)
  return false
}

function recordFailure(ip: string): void {
  const entry = rateLimitMap.get(ip) ?? { count: 0, lockedUntil: 0 }
  entry.count++
  if (entry.count >= RATE_LIMIT_MAX) {
    entry.lockedUntil = Date.now() + RATE_LIMIT_WINDOW_MS
    entry.count = 0
  }
  rateLimitMap.set(ip, entry)
}

function clearFailures(ip: string): void {
  rateLimitMap.delete(ip)
}

function getClientIP(c: Context): string {
  const xff = c.req.header('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return '127.0.0.1'
}

// ============================================================
// 签名密钥
// ============================================================

/**
 * 生成 32 字节随机 HMAC-SHA256 密钥
 * 每次服务器启动时生成，重启后 session 失效
 */
export function generateSigningKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

// ============================================================
// Cookie 签名与验证
// ============================================================

async function getCryptoKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  )
}

function toBase64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signPayload(payload: string, key: Uint8Array): Promise<string> {
  const cryptoKey = await getCryptoKey(key)
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(payload))
  return toBase64url(sig)
}

/**
 * 时序安全字符串比较（防止时序攻击）
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const bufA = enc.encode(a)
  const bufB = enc.encode(b)
  if (bufA.length !== bufB.length) {
    // 执行虚假比较避免泄露长度差异的时序信息
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * 生成 Signed Cookie 值
 * 格式：<base64url(payload)>.<hmac-sha256>
 */
async function createSessionToken(config: AuthConfig): Promise<string> {
  const payload = toBase64url(new TextEncoder().encode(JSON.stringify({ ts: Date.now() })))
  const sig = await signPayload(payload, config.signingKey)
  return `${payload}.${sig}`
}

/**
 * 验证 Signed Cookie：签名正确 + 未过期
 */
async function verifySessionToken(token: string, config: AuthConfig): Promise<boolean> {
  const dotIdx = token.lastIndexOf('.')
  if (dotIdx === -1) return false

  const payload = token.slice(0, dotIdx)
  const sig = token.slice(dotIdx + 1)

  const expectedSig = await signPayload(payload, config.signingKey)
  if (!timingSafeEqual(sig, expectedSig)) return false

  try {
    const json = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
      )
    ) as { ts: number }
    if (Date.now() - json.ts > config.maxAge * 1000) return false
  } catch {
    return false
  }

  return true
}

// ============================================================
// 工具函数
// ============================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================
// 认证中间件
// ============================================================

/**
 * 创建认证中间件
 * - API 请求未认证：返回 401 JSON
 * - 页面请求未认证：302 重定向到 /login
 */
export function createAuthMiddleware(config: AuthConfig) {
  return async (c: Context, next: Next) => {
    const path = c.req.path

    // 白名单：登录相关路由 + 静态资源（JS/CSS/字体等）
    if (
      path === '/login' ||
      path.startsWith('/api/auth/') ||
      path.startsWith('/assets/')
    ) {
      return next()
    }

    const token = getCookie(c, COOKIE_NAME)
    if (token && await verifySessionToken(token, config)) {
      return next()
    }

    const isApi = path.startsWith('/api/') ||
      c.req.header('accept')?.includes('application/json')

    if (isApi) {
      return c.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, 401)
    }

    const returnTo = encodeURIComponent(c.req.url)
    return c.redirect(`/login?returnTo=${returnTo}`, 302)
  }
}

// ============================================================
// 认证路由
// ============================================================

/**
 * 注册认证相关路由到 Hono app
 * - GET  /login            登录页
 * - POST /api/auth/login   登录
 * - POST /api/auth/logout  登出
 */
export function createAuthRoutes(app: Hono, config: AuthConfig) {
  // GET /login
  app.get('/login', (c) => {
    const returnTo = c.req.query('returnTo') ?? '/'
    return c.html(renderLoginPage(returnTo))
  })

  // POST /api/auth/login
  app.post('/api/auth/login', async (c) => {
    const ip = getClientIP(c)

    if (isRateLimited(ip)) {
      await delay(RESPONSE_DELAY_MS)
      return c.json({ error: '登录尝试过多，请 15 分钟后重试', code: 'RATE_LIMITED' }, 429)
    }

    let body: Record<string, unknown> = {}
    try { body = await c.req.json() } catch { /* ignore */ }

    const inputPassword = typeof body.password === 'string' ? body.password : ''

    if (!inputPassword) {
      await delay(RESPONSE_DELAY_MS)
      recordFailure(ip)
      return c.json({ error: '请输入密码', code: 'PASSWORD_REQUIRED' }, 400)
    }

    // 时序安全密码比较
    const enc = new TextEncoder()
    const inputBuf = enc.encode(inputPassword)
    const correctBuf = enc.encode(config.password)

    let isValid = false
    if (inputBuf.length === correctBuf.length) {
      isValid = crypto.timingSafeEqual(inputBuf, correctBuf)
    } else {
      // 执行虚假比较，避免长度差异泄露时序信息
      crypto.timingSafeEqual(correctBuf, correctBuf)
    }

    if (!isValid) {
      await delay(RESPONSE_DELAY_MS)
      recordFailure(ip)
      return c.json({ error: '密码错误', code: 'INVALID_PASSWORD' }, 401)
    }

    clearFailures(ip)
    const token = await createSessionToken(config)
    setCookie(c, COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: config.maxAge,
    })

    const returnTo = typeof body.returnTo === 'string' ? body.returnTo : '/'
    return c.json({ ok: true, redirect: returnTo })
  })

  // POST /api/auth/logout
  app.post('/api/auth/logout', (c) => {
    deleteCookie(c, COOKIE_NAME, { path: '/' })
    return c.json({ ok: true })
  })
}

// ============================================================
// 登录页 HTML（内联样式，无外部依赖）
// ============================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderLoginPage(returnTo: string): string {
  const safeReturnTo = escapeHtml(returnTo)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录 · Markdown Browser</title>
  <style>
    :root {
      --bg: #ffffff;
      --bg-card: #f6f8fa;
      --text: #24292f;
      --text-muted: #57606a;
      --border: #d0d7de;
      --accent: #0969da;
      --danger: #cf222e;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117;
        --bg-card: #161b22;
        --text: #c9d1d9;
        --text-muted: #8b949e;
        --border: #30363d;
        --accent: #58a6ff;
        --danger: #f85149;
      }
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      width: 100%;
      max-width: 340px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px 28px;
    }
    .logo {
      font-size: 24px;
      font-weight: 700;
      text-align: center;
      letter-spacing: -0.5px;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 13px;
      color: var(--text-muted);
      text-align: center;
      margin-bottom: 24px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
    }
    input[type="password"] {
      width: 100%;
      padding: 9px 12px;
      font-size: 14px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      color: var(--text);
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    input[type="password"]:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
    }
    input[type="password"].err { border-color: var(--danger); }
    .error-msg {
      color: var(--danger);
      font-size: 12px;
      min-height: 18px;
      margin: 6px 0 14px;
    }
    button {
      width: 100%;
      padding: 10px;
      font-size: 14px;
      font-weight: 500;
      border: none;
      border-radius: 6px;
      background: var(--accent);
      color: #fff;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    button:hover:not(:disabled) { opacity: 0.88; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Markdown Browser</div>
    <div class="subtitle">请输入访问密码</div>
    <form id="form">
      <label for="pw">密码</label>
      <input
        type="password"
        id="pw"
        placeholder="请输入密码"
        autocomplete="current-password"
        autofocus
        required
      >
      <div class="error-msg" id="err"></div>
      <button type="submit" id="btn">登录</button>
    </form>
  </div>
  <script>
    const returnTo = decodeURIComponent("${safeReturnTo}");
    const form = document.getElementById("form");
    const pw = document.getElementById("pw");
    const err = document.getElementById("err");
    const btn = document.getElementById("btn");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = pw.value;
      if (!password) { err.textContent = "请输入密码"; pw.classList.add("err"); return; }

      btn.disabled = true;
      btn.textContent = "登录中…";
      err.textContent = "";
      pw.classList.remove("err");

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, returnTo }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          window.location.href = data.redirect || "/";
        } else {
          err.textContent = data.error || "登录失败";
          pw.classList.add("err");
          pw.focus();
        }
      } catch {
        err.textContent = "网络错误，请重试";
      } finally {
        btn.disabled = false;
        btn.textContent = "登录";
      }
    });

    pw.addEventListener("input", () => { pw.classList.remove("err"); err.textContent = ""; });
  </script>
</body>
</html>`
}
