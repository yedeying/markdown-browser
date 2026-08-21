// SillyTavern (ST) 聊天导出 JSONL 的检测/解析。纯函数，便于单测。
// 规则见 docs/superpowers/specs/2026-08-20-jsonl-st-preview-design.md §2。

export type StHeader = { user_name: unknown; character_name: unknown; chat_metadata: object }

export type StMessage = {
  name: string
  is_user: boolean
  mes: string
  send_date: string
  extra: Record<string, unknown>
}

export type StParseOk = {
  ok: true
  header: StHeader | null
  messages: StMessage[]
  characterName: string | null
  userName: string | null
}

export type StParseResult = StParseOk | { ok: false; reason: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 首行是否具备 header 三件套：user_name 存在、character_name 存在、chat_metadata 为 object。 */
function isHeaderCandidate(obj: Record<string, unknown>): obj is StHeader & Record<string, unknown> {
  return (
    'user_name' in obj &&
    'character_name' in obj &&
    isPlainObject(obj.chat_metadata)
  )
}

/** 校验消息必选字段：name/is_user/mes/send_date/extra。额外字段不做要求，原样保留在 extra 之外。 */
function toStMessage(obj: Record<string, unknown>): StMessage | null {
  if (typeof obj.name !== 'string') return null
  if (typeof obj.is_user !== 'boolean') return null
  if (typeof obj.mes !== 'string') return null
  if (typeof obj.send_date !== 'string') return null
  if (!isPlainObject(obj.extra)) return null
  return {
    name: obj.name,
    is_user: obj.is_user,
    mes: obj.mes,
    send_date: obj.send_date,
    // 原样保留 extra（含 reasoning/model 等扩展字段，供 Task 5 使用），不做任何裁剪/克隆。
    extra: obj.extra,
  }
}

export function parseStJsonl(text: string): StParseResult {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { ok: false, reason: 'empty' }

  const objects: Record<string, unknown>[] = []
  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown
    try {
      parsed = JSON.parse(lines[i])
    } catch {
      return { ok: false, reason: `invalid JSON on line ${i + 1}` }
    }
    if (!isPlainObject(parsed)) {
      return { ok: false, reason: `line ${i + 1} is not a JSON object` }
    }
    objects.push(parsed)
  }

  let header: StHeader | null = null
  let messageObjects = objects
  if (isHeaderCandidate(objects[0])) {
    header = {
      user_name: objects[0].user_name,
      character_name: objects[0].character_name,
      chat_metadata: objects[0].chat_metadata as object,
    }
    messageObjects = objects.slice(1)
  }

  if (messageObjects.length === 0) return { ok: false, reason: 'no messages' }

  const messages: StMessage[] = []
  for (let i = 0; i < messageObjects.length; i++) {
    const msg = toStMessage(messageObjects[i])
    if (!msg) {
      const lineNo = header ? i + 2 : i + 1
      return { ok: false, reason: `line ${lineNo} is missing required message fields` }
    }
    messages.push(msg)
  }

  const characterName = messages.find((m) => !m.is_user)?.name ?? null
  const userName = messages.find((m) => m.is_user)?.name ?? null

  return { ok: true, header, messages, characterName, userName }
}
