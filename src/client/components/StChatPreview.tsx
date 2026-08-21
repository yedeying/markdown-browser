import type { FunctionalComponent } from 'preact'
import { renderStMarkdown } from '../utils/stMarkdown.js'
import type { StMessage } from '../utils/stJsonl.js'

function formatSendDate(sendDate: string): string {
  const d = new Date(sendDate)
  if (Number.isNaN(d.getTime())) return sendDate
  return d.toLocaleString()
}

const StChatBubble: FunctionalComponent<{ message: StMessage }> = ({ message }) => {
  const reasoning = typeof message.extra?.reasoning === 'string' ? message.extra.reasoning : ''
  const model = typeof message.extra?.model === 'string' ? message.extra.model : null

  return (
    <div
      class={`st-bubble-row ${message.is_user ? 'st-bubble-row-user' : 'st-bubble-row-char'}`}
      data-testid="st-chat-bubble"
    >
      <div class="st-bubble">
        <div class="st-bubble-meta">
          <span class="st-bubble-name">{message.name}</span>
          {model && <span class="st-bubble-model">{model}</span>}
          <span class="st-bubble-date">{formatSendDate(message.send_date)}</span>
        </div>
        {/* 非空 extra.reasoning 才渲染；原生 <details> 不带 open，默认折叠 */}
        {reasoning && (
          <details class="st-bubble-reasoning" data-testid="st-bubble-reasoning">
            <summary>思考过程</summary>
            <div
              class="st-bubble-reasoning-body markdown-body"
              dangerouslySetInnerHTML={{ __html: renderStMarkdown(reasoning) }}
            />
          </details>
        )}
        <div
          class="st-bubble-mes markdown-body"
          dangerouslySetInnerHTML={{ __html: renderStMarkdown(message.mes) }}
        />
      </div>
    </div>
  )
}

interface Props {
  fileName?: string | null
  messages: StMessage[]
  characterName: string | null
  userName: string | null
}

/** SillyTavern 聊天气泡预览：跳过 header，按行序渲染消息；不做 swipes UI。 */
const StChatPreview: FunctionalComponent<Props> = ({ fileName, messages, characterName, userName }) => {
  return (
    <div class="st-chat-preview" data-testid="st-chat-preview">
      <div class="st-chat-header">
        {fileName && <span class="st-chat-filename">{fileName}</span>}
        <span class="st-chat-count">{messages.length} 条消息</span>
        {characterName && <span class="st-chat-role">角色：{characterName}</span>}
        {userName && <span class="st-chat-role">玩家：{userName}</span>}
      </div>
      <div class="st-chat-messages">
        {messages.map((message, i) => (
          <StChatBubble key={i} message={message} />
        ))}
      </div>
    </div>
  )
}

export default StChatPreview
