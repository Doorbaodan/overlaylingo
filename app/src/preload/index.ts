import { contextBridge, ipcRenderer } from 'electron'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
  displayId?: number
}

export type Theme = 'light' | 'dark'

export type FontSize = 'small' | 'medium' | 'large'

export interface CaptureInit {
  roiLocal: { x: number; y: number; width: number; height: number } | null
  displayWidth: number
  displayHeight: number
}

export interface BalanceInfo {
  currency: string
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}

export interface UsageStats {
  promptTokens: number
  completionTokens: number
  estimatedCost: number
}

export type TaskType = 'dialogue' | 'text'

export interface Task {
  id: string
  name: string
  type: TaskType
  background: string
  createdAt: number
}

export interface ChatMessage {
  id: string
  taskId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

const api = {
  overlay: {
    toggle: (): void => ipcRenderer.send('overlay:toggle'),
    hide: (): void => ipcRenderer.send('overlay:hide'),
    collapse: (): void => ipcRenderer.send('overlay:collapse'),
    expand: (): void => ipcRenderer.send('overlay:expand'),
    move: (x: number, y: number): void => ipcRenderer.send('overlay:move', x, y),
    setClickThrough: (v: boolean): void => ipcRenderer.send('overlay:set-click-through', v)
  },
  selection: {
    toggle: (): void => ipcRenderer.send('selection:toggle'),
    confirm: (rect: Rect): void => ipcRenderer.send('selection:confirm', rect),
    cancel: (): void => ipcRenderer.send('selection:cancel'),
    getInit: (): Promise<{ offset: { x: number; y: number }; currentRoi: Rect | null; background: string }> =>
      ipcRenderer.invoke('selection:get-init')
  },
  capture: {
    getInit: (): Promise<CaptureInit> => ipcRenderer.invoke('capture:get-init'),
    sendFrame: (buf: ArrayBuffer): void => ipcRenderer.send('capture:frame', buf),
    togglePreview: (): void => ipcRenderer.send('capture:toggle-preview'),
    startCollect: (): void => ipcRenderer.send('capture:start-collect'),
    stopCollect: (): Promise<string[]> => ipcRenderer.invoke('capture:stop-collect'),
    screenshot: (taskId: string): void => ipcRenderer.send('capture:screenshot', taskId),
    onDraft: (cb: (count: number) => void): (() => void) => {
      const listener = (_e: unknown, count: number): void => cb(count)
      ipcRenderer.on('capture:draft', listener)
      return () => ipcRenderer.removeListener('capture:draft', listener)
    },
    onCollectEvent: (cb: (event: 'started' | 'cancelled') => void): (() => void) => {
      const listener = (_e: unknown, event: 'started' | 'cancelled'): void => cb(event)
      ipcRenderer.on('capture:collect-event', listener)
      return () => ipcRenderer.removeListener('capture:collect-event', listener)
    },
    onScreenshotResult: (
      cb: (r: { taskId: string; ok?: boolean; error?: string }) => void
    ): (() => void) => {
      const listener = (_e: unknown, r: { taskId: string; ok?: boolean; error?: string }): void =>
        cb(r)
      ipcRenderer.on('capture:screenshot-result', listener)
      return () => ipcRenderer.removeListener('capture:screenshot-result', listener)
    }
  },
  settings: {
    getTheme: (): Promise<Theme> => ipcRenderer.invoke('settings:get-theme'),
    setTheme: (theme: Theme): void => ipcRenderer.send('settings:set-theme', theme),
    getFontSize: (): Promise<FontSize> => ipcRenderer.invoke('settings:get-font-size'),
    setFontSize: (size: FontSize): void => ipcRenderer.send('settings:set-font-size', size),
    getKeyStatus: (): Promise<{ hasKey: boolean }> => ipcRenderer.invoke('settings:get-key-status'),
    setApiKey: (key: string): void => ipcRenderer.send('settings:set-api-key', key),
    getBalance: (): Promise<BalanceInfo | null> => ipcRenderer.invoke('settings:get-balance'),
    getUsage: (): Promise<UsageStats> => ipcRenderer.invoke('settings:get-usage'),
    testConnection: (): Promise<BalanceInfo | null> => ipcRenderer.invoke('settings:test-connection')
  },
  llm: {
    abort: (): void => ipcRenderer.send('llm:abort'),
    onBusy: (cb: (busy: boolean) => void): (() => void) => {
      const listener = (_e: unknown, busy: boolean): void => cb(busy)
      ipcRenderer.on('llm:busy', listener)
      return () => ipcRenderer.removeListener('llm:busy', listener)
    }
  },
  tasks: {
    list: (): Promise<Task[]> => ipcRenderer.invoke('tasks:list'),
    create: (name: string, type: TaskType, background: string): Promise<Task> =>
      ipcRenderer.invoke('tasks:create', name, type, background),
    remove: (id: string): void => ipcRenderer.send('tasks:delete', id),
    messages: (taskId: string): Promise<ChatMessage[]> => ipcRenderer.invoke('tasks:messages', taskId),
    addMessage: (taskId: string, role: 'user' | 'assistant', content: string): void =>
      ipcRenderer.send('tasks:add-message', taskId, role, content),
    chat: (taskId: string, content: string): Promise<string> =>
      ipcRenderer.invoke('tasks:chat', taskId, content),
    translateDialogue: (taskId: string, texts: string[]): Promise<string> =>
      ipcRenderer.invoke('tasks:translate-dialogue', taskId, texts),
    translateText: (taskId: string, text: string): Promise<string> =>
      ipcRenderer.invoke('tasks:translate-text', taskId, text),
    regenerate: (taskId: string): Promise<string> =>
      ipcRenderer.invoke('tasks:regenerate', taskId),
    onChanged: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('tasks:changed', listener)
      return () => ipcRenderer.removeListener('tasks:changed', listener)
    },
    onMessagesChanged: (cb: (taskId: string) => void): (() => void) => {
      const listener = (_e: unknown, taskId: string): void => cb(taskId)
      ipcRenderer.on('messages:changed', listener)
      return () => ipcRenderer.removeListener('messages:changed', listener)
    }
  },
  main: {
    minimize: (): void => ipcRenderer.send('main:minimize'),
    show: (): void => ipcRenderer.send('main:show')
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (err) {
    console.error('[preload] exposeInMainWorld failed:', err)
  }
} else {
  // @ts-ignore contextIsolation 关闭时的兜底
  window.api = api
}
