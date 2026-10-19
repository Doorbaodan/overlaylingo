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

export interface SelectionInit {
  offset: { x: number; y: number }
  currentRoi: Rect | null
  background: string
}

export interface Api {
  clipboard: {
    writeText: (text: string) => void
  }
  overlay: {
    toggle: () => void
    hide: () => void
    collapse: () => void
    expand: () => void
    move: (x: number, y: number) => void
    setClickThrough: (v: boolean) => void
  }
  selection: {
    toggle: () => void
    confirm: (rect: Rect) => void
    cancel: () => void
    getInit: () => Promise<SelectionInit>
  }
  capture: {
    getInit: () => Promise<CaptureInit>
    sendFrame: (buf: ArrayBuffer) => void
    togglePreview: () => void
    startCollect: () => void
    stopCollect: () => Promise<string[]>
    screenshot: (taskId: string) => void
    onDraft: (cb: (count: number) => void) => () => void
    onCollectEvent: (cb: (event: 'started' | 'cancelled') => void) => () => void
    onScreenshotResult: (cb: (r: { taskId: string; ok?: boolean; error?: string }) => void) => () => void
  }
  settings: {
    getTheme: () => Promise<Theme>
    setTheme: (theme: Theme) => void
    getFontSize: () => Promise<FontSize>
    setFontSize: (size: FontSize) => void
    getKeyStatus: () => Promise<{ hasKey: boolean }>
    setApiKey: (key: string) => void
    getBalance: () => Promise<BalanceInfo | null>
    getUsage: () => Promise<UsageStats>
    testConnection: () => Promise<BalanceInfo | null>
  }
  llm: {
    abort: () => void
    onBusy: (cb: (busy: boolean) => void) => () => void
  }
  tasks: {
    list: () => Promise<Task[]>
    create: (name: string, type: TaskType, background: string) => Promise<Task>
    remove: (id: string) => void
    messages: (taskId: string) => Promise<ChatMessage[]>
    addMessage: (taskId: string, role: 'user' | 'assistant', content: string) => void
    chat: (taskId: string, content: string) => Promise<string>
    translateDialogue: (taskId: string, texts: string[]) => Promise<string>
    translateText: (taskId: string, text: string) => Promise<string>
    regenerate: (taskId: string) => Promise<string>
    onChanged: (cb: () => void) => () => void
    onMessagesChanged: (cb: (taskId: string) => void) => () => void
  }
  main: {
    minimize: () => void
    show: () => void
  }
}

declare global {
  interface Window {
    api: Api
  }
}
