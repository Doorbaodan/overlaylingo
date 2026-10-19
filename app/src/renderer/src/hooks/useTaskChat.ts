import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, Task, TaskType } from '../types'

export type CaptureState = 'idle' | 'selecting' | 'capturing'

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message))
}

/** 任务/消息/对话/捕获的共享逻辑（主窗口与悬浮窗复用） */
export function useTaskChat() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [captureState, setCaptureState] = useState<CaptureState>('idle')
  const [draft, setDraft] = useState<number>(0)
  const currentTaskIdRef = useRef<string | null>(null)

  useEffect(() => {
    currentTaskIdRef.current = currentTaskId
  }, [currentTaskId])

  const currentTask = useMemo(
    () => tasks.find((t) => t.id === currentTaskId) ?? null,
    [tasks, currentTaskId]
  )

  useEffect(() => {
    window.api.tasks.list().then((list) => {
      setTasks(list)
      if (list.length && !currentTaskId) {
        setCurrentTaskId(list[0].id)
        window.api.tasks.messages(list[0].id).then(setMessages)
      }
    })
    const offDraft = window.api.capture.onDraft(setDraft)
    const offEvent = window.api.capture.onCollectEvent((event) => {
      if (event === 'started') setCaptureState('capturing')
      else if (event === 'cancelled') setCaptureState('idle')
    })
    const offShot = window.api.capture.onScreenshotResult((r) => {
      window.api.tasks.messages(r.taskId).then(setMessages)
    })
    const offChanged = window.api.tasks.onChanged(() => {
      window.api.tasks.list().then(setTasks)
    })
    const offMsgChanged = window.api.tasks.onMessagesChanged((taskId) => {
      if (taskId === currentTaskIdRef.current) {
        window.api.tasks.messages(taskId).then(setMessages)
      }
    })
    const offBusy = window.api.llm.onBusy(setBusy)
    return () => {
      offDraft()
      offEvent()
      offShot()
      offChanged()
      offMsgChanged()
      offBusy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadMessages = (taskId: string): void => {
    window.api.tasks.messages(taskId).then(setMessages)
  }

  const selectTask = (id: string): void => {
    setCurrentTaskId(id)
    loadMessages(id)
  }

  const create = async (name: string, type: TaskType, background: string): Promise<void> => {
    const task = await window.api.tasks.create(name, type, background)
    setTasks((prev) => [...prev, task])
    selectTask(task.id)
  }

  const remove = (id: string): void => {
    window.api.tasks.remove(id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
    if (id === currentTaskId) {
      setCurrentTaskId(null)
      setMessages([])
    }
  }

  const send = async (content: string): Promise<void> => {
    if (!currentTaskId || busy) return
    try {
      await window.api.tasks.chat(currentTaskId, content)
    } catch (e) {
      if (!isAbort(e)) {
        window.api.tasks.addMessage(
          currentTaskId,
          'assistant',
          '（调用失败：' + (e instanceof Error ? e.message : String(e)) + '）'
        )
        loadMessages(currentTaskId)
      }
    }
  }

  /** 重新生成最后一条 AI 回复 */
  const regenerate = async (): Promise<void> => {
    if (!currentTaskId || busy) return
    try {
      await window.api.tasks.regenerate(currentTaskId)
    } catch (e) {
      if (!isAbort(e)) {
        window.api.tasks.addMessage(
          currentTaskId,
          'assistant',
          '（重新生成失败：' + (e instanceof Error ? e.message : String(e)) + '）'
        )
        loadMessages(currentTaskId)
      }
    }
  }

  /** 停止捕获并自动翻译 */
  const stopAndTranslate = async (): Promise<void> => {
    if (!currentTaskId) return
    setCaptureState('idle')
    const images = await window.api.capture.stopCollect()
    setDraft(0)
    if (images.length) {
      try {
        await window.api.tasks.translateDialogue(currentTaskId, images)
      } catch (e) {
        if (!isAbort(e)) {
          window.api.tasks.addMessage(
            currentTaskId,
            'assistant',
            '（翻译失败：' + (e instanceof Error ? e.message : String(e)) + '）'
          )
          loadMessages(currentTaskId)
        }
      }
    }
  }

  const toggleCapture = (): void => {
    if (!currentTaskId || !currentTask) return
    if (captureState === 'capturing') {
      void stopAndTranslate()
    } else if (captureState === 'idle') {
      setCaptureState('selecting')
      setDraft(0)
      window.api.capture.startCollect()
    }
    // selecting 状态：忽略重复点击
  }

  const screenshot = (): void => {
    if (!currentTaskId || busy || captureState !== 'idle') return
    window.api.capture.screenshot(currentTaskId)
  }

  return {
    tasks,
    currentTaskId,
    currentTask,
    messages,
    busy,
    captureState,
    draft,
    selectTask,
    create,
    remove,
    send,
    regenerate,
    toggleCapture,
    screenshot
  }
}
