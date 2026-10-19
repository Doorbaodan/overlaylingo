import { getDb } from './db'

/** 屏幕矩形（绝对坐标） */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
  displayId?: number
}

export type Theme = 'light' | 'dark'

/** 字体大小档位 */
export type FontSize = 'small' | 'medium' | 'large'

/** 任务类型：快速对话翻译 / 长文本翻译 */
export type TaskType = 'dialogue' | 'text'

export interface Task {
  id: string
  name: string
  type: TaskType
  /** 背景信息（语境/世界观/术语，供 AI 理解） */
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

export interface OverlayConfig {
  /** 悬浮球位置（左上角），仅由鼠标拖动改变 */
  bubblePosition: { x: number; y: number } | null
  /** 弹窗位置与尺寸（用户拖动/拉伸后记忆） */
  panelBounds: { x: number; y: number; width: number; height: number } | null
}

/** 用户偏好（存 settings 表，键值对） */
export interface Preferences {
  theme: Theme
  fontSize: FontSize
  overlay: OverlayConfig
  captureRegion: Rect | null
  /** API Key 的 DPAPI 密文（base64），空串表示未配置，绝不存明文 */
  apiKeyEncrypted: string
  /** 累计用量（token 与费用估算） */
  usageStats: {
    promptTokens: number
    completionTokens: number
    estimatedCost: number
  }
}

const DEFAULTS: Preferences = {
  theme: 'light',
  fontSize: 'medium',
  overlay: {
    bubblePosition: null,
    panelBounds: null
  },
  captureRegion: null,
  apiKeyEncrypted: '',
  usageStats: {
    promptTokens: 0,
    completionTokens: 0,
    estimatedCost: 0
  }
}

const SETTINGS_KEYS = Object.keys(DEFAULTS) as (keyof Preferences)[]

class Store {
  private cache: Preferences

  constructor() {
    const db = getDb()
    this.cache = structuredClone(DEFAULTS)
    const get = db.prepare('SELECT value FROM settings WHERE key = ?')
    for (const key of SETTINGS_KEYS) {
      const row = get.get(key) as { value: string } | undefined
      if (!row) continue
      try {
        ;(this.cache as unknown as Record<string, unknown>)[key] = JSON.parse(row.value)
      } catch {
        /* 单条损坏时回退默认值 */
      }
    }
  }

  get<K extends keyof Preferences>(key: K): Preferences[K] {
    return this.cache[key]
  }

  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    this.cache[key] = value
    getDb()
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, JSON.stringify(value))
  }

  /** 用于就地修改嵌套对象（如 overlay）后落盘 */
  save(): void {
    this.set('overlay', this.cache.overlay)
  }
}

let _store: Store | null = null

/** 懒加载单例；首次调用需在 app ready 之后 */
export function getStore(): Store {
  if (!_store) _store = new Store()
  return _store
}
