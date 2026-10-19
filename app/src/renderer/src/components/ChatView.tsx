import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, Task } from '../types'
import type { CaptureState } from '../hooks/useTaskChat'

interface Props {
  task: Task | null
  messages: ChatMessage[]
  captureState: CaptureState
  busy: boolean
  onSend: (content: string) => void
  onRegenerate: () => void
}

export default function ChatView({ task, messages, captureState, busy, onSend, onRegenerate }: Props) {
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const send = (): void => {
    const c = input.trim()
    if (!c || busy) return
    setInput('')
    onSend(c)
  }

  const copy = (id: string, content: string): void => {
    window.api.clipboard.writeText(content)
    setCopiedId(id)
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur))
    }, 1500)
  }

  // 最后一条 assistant 消息的索引（用于显示重新生成按钮）
  let lastAssistantIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIdx = i
      break
    }
  }

  if (!task) {
    return (
      <div className="chat-empty">
        <p>选择或新建一个任务开始</p>
        <p className="sub">左侧可新建「快速对话翻译」或「长文本翻译」任务</p>
      </div>
    )
  }

  return (
    <div className="chat-view">
      <div className="chat-head">
        <span className="chat-head-title">{task.name}</span>
        {captureState === 'capturing' && <span className="chat-capturing">正在捕获字幕…</span>}
      </div>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-hint">
            在悬浮窗点「开始捕获」框选字幕区域，停止后这里会显示中英对照翻译
          </div>
        )}

        {messages.map((m, i) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="msg-bubble">
              <span className="msg-content">{m.content}</span>
              <div className="msg-actions">
                <button className="copy-btn" onClick={() => copy(m.id, m.content)}>
                  {copiedId === m.id ? '已复制' : '复制'}
                </button>
                {m.role === 'assistant' && i === lastAssistantIdx && (
                  <button className="regen-btn" onClick={onRegenerate} disabled={busy}>
                    ↻ 重新生成
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {busy && (
          <div className="msg assistant">
            <div className="msg-bubble typing">
              <span>思考中…</span>
              <button className="abort-btn" onClick={() => window.api.llm.abort()}>
                停止
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="chat-input-bar">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="输入内容追问，Enter 发送"
        />
        <button className="btn primary" onClick={send} disabled={busy || !input.trim()}>
          发送
        </button>
      </div>
    </div>
  )
}
