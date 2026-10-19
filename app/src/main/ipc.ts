import { ipcMain } from 'electron'
import { windows } from './windows'
import { capture } from './capture'
import { getStore, type Rect, type Theme, type TaskType, type FontSize } from './store'
import { llm } from './llm'
import {
  addMessage,
  createTask,
  deleteTask,
  getTask,
  listMessages,
  listTasks,
  removeLastAssistant
} from './tasks'

/** 重新生成上下文（每个任务记录最后一次生成方式） */
type RegenCtx = { type: 'dialogue'; images: string[] } | { type: 'chat' }
const regenCtx = new Map<string, RegenCtx>()

export function setupIpc(): void {
  // 悬浮窗（球 + 弹窗）
  ipcMain.on('overlay:toggle', () => windows.toggleOverlay())
  ipcMain.on('overlay:hide', () => windows.hideOverlay())
  ipcMain.on('overlay:collapse', () => windows.collapseOverlay())
  ipcMain.on('overlay:expand', () => windows.expandOverlay())
  ipcMain.on('overlay:move', (_e, x: number, y: number) => windows.moveBubble(x, y))
  ipcMain.on('overlay:set-click-through', (_e, v: boolean) => windows.setOverlayClickThrough(v))
  ipcMain.on('main:minimize', () => windows.minimizeMainToBubble())
  ipcMain.on('main:show', () => windows.showMain())

  // 框选遮罩
  ipcMain.on('selection:toggle', () => windows.toggleSelection())
  ipcMain.on('selection:confirm', (_e, rect: Rect) => {
    windows.saveCaptureRegion(rect)
    console.log('[selection] saved region:', rect)
    windows.closeSelection()
    capture.onSelectionConfirmed()
  })
  ipcMain.on('selection:cancel', () => {
    windows.closeSelection()
    capture.cancelPending()
  })
  ipcMain.handle('selection:get-init', () => windows.getSelectionInit())

  // 捕获
  ipcMain.handle('capture:get-init', () => capture.getInit())
  ipcMain.on('capture:frame', (_e, buf: ArrayBuffer) => capture.onFrame(buf))
  ipcMain.on('capture:toggle-preview', () => capture.togglePreview())
  ipcMain.on('capture:start-collect', (e) => {
    capture.startCollecting(
      (count) => e.sender.send('capture:draft', count),
      (event) => e.sender.send('capture:collect-event', event)
    )
  })
  ipcMain.handle('capture:stop-collect', () => capture.stopCollecting())
  ipcMain.on('capture:screenshot', (e, taskId: string) => {
    capture.requestScreenshot(async (image) => {
      if (!image) {
        e.sender.send('capture:screenshot-result', { taskId, error: '截图失败' })
        return
      }
      const task = getTask(taskId)
      addMessage(taskId, 'user', '（截图内容，请详细解析）')
      windows.broadcast('messages:changed', taskId)
      windows.broadcast('llm:busy', true)
      try {
        const reply = await llm.translateTextVision(image, task?.background ?? '')
        addMessage(taskId, 'assistant', reply)
        windows.broadcast('messages:changed', taskId)
        windows.broadcast('llm:busy', false)
        e.sender.send('capture:screenshot-result', { taskId, ok: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        addMessage(taskId, 'assistant', '（解析失败：' + msg + '）')
        windows.broadcast('messages:changed', taskId)
        windows.broadcast('llm:busy', false)
        e.sender.send('capture:screenshot-result', { taskId, error: msg })
      }
    })
  })

  // 设置
  ipcMain.handle('settings:get-theme', () => getStore().get('theme'))
  ipcMain.on('settings:set-theme', (_e, theme: Theme) => {
    getStore().set('theme', theme)
  })
  ipcMain.handle('settings:get-font-size', () => getStore().get('fontSize'))
  ipcMain.on('settings:set-font-size', (_e, size: FontSize) => {
    getStore().set('fontSize', size)
  })

  // 任务与消息
  ipcMain.handle('tasks:list', () => listTasks())
  ipcMain.handle('tasks:create', (_e, name: string, type: TaskType, background: string) => {
    const task = createTask(name, type, background)
    windows.broadcast('tasks:changed')
    return task
  })
  ipcMain.on('tasks:delete', (_e, id: string) => {
    deleteTask(id)
    windows.broadcast('tasks:changed')
  })
  ipcMain.handle('tasks:messages', (_e, taskId: string) => listMessages(taskId))
  ipcMain.on('tasks:add-message', (_e, taskId: string, role: 'user' | 'assistant', content: string) =>
    addMessage(taskId, role, content)
  )

  // 任务 AI 交互
  ipcMain.handle('tasks:chat', async (_e, taskId: string, content: string) => {
    const task = getTask(taskId)
    const background = task?.background ?? ''
    addMessage(taskId, 'user', content)
    windows.broadcast('messages:changed', taskId)
    windows.broadcast('llm:busy', true)
    const history = listMessages(taskId).map((m) => ({ role: m.role, content: m.content }))
    const reply = await llm.chat(history, background)
    addMessage(taskId, 'assistant', reply)
    windows.broadcast('messages:changed', taskId)
    windows.broadcast('llm:busy', false)
    regenCtx.set(taskId, { type: 'chat' })
    return reply
  })

  ipcMain.handle('tasks:translate-dialogue', async (_e, taskId: string, images: string[]) => {
    const task = getTask(taskId)
    const background = task?.background ?? ''
    addMessage(taskId, 'user', `（已捕获 ${images.length} 张字幕截图，请翻译）`)
    windows.broadcast('messages:changed', taskId)
    windows.broadcast('llm:busy', true)
    const reply = await llm.translateDialogueVision(images, background)
    addMessage(taskId, 'assistant', reply)
    windows.broadcast('messages:changed', taskId)
    windows.broadcast('llm:busy', false)
    regenCtx.set(taskId, { type: 'dialogue', images })
    return reply
  })

  ipcMain.handle('tasks:translate-text', async (_e, taskId: string, image: string) => {
    const task = getTask(taskId)
    const background = task?.background ?? ''
    addMessage(taskId, 'user', '（截图内容，请详细解析）')
    windows.broadcast('messages:changed', taskId)
    windows.broadcast('llm:busy', true)
    const reply = await llm.translateTextVision(image, background)
    addMessage(taskId, 'assistant', reply)
    windows.broadcast('messages:changed', taskId)
    windows.broadcast('llm:busy', false)
    return reply
  })

  ipcMain.handle('tasks:regenerate', async (_e, taskId: string) => {
    const task = getTask(taskId)
    const background = task?.background ?? ''
    const ctx = regenCtx.get(taskId)
    removeLastAssistant(taskId)
    windows.broadcast('messages:changed', taskId)
    windows.broadcast('llm:busy', true)
    let reply = ''
    if (ctx?.type === 'dialogue' && ctx.images.length) {
      reply = await llm.translateDialogueVision(ctx.images, background)
    } else {
      const history = listMessages(taskId).map((m) => ({ role: m.role, content: m.content }))
      reply = await llm.chat(history, background)
    }
    addMessage(taskId, 'assistant', reply)
    windows.broadcast('messages:changed', taskId)
    windows.broadcast('llm:busy', false)
    return reply
  })

  // 模型层（DeepSeek）
  ipcMain.handle('settings:get-key-status', () => ({ hasKey: llm.hasApiKey() }))
  ipcMain.on('settings:set-api-key', (_e, key: string) => llm.setApiKey(key))
  ipcMain.handle('settings:get-balance', () => llm.getBalance())
  ipcMain.handle('settings:get-usage', () => llm.getUsage())
  ipcMain.handle('settings:test-connection', () => llm.testConnection())
  ipcMain.on('llm:abort', () => llm.abort())
}
