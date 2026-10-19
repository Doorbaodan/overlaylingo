import { safeStorage } from 'electron'
import { getStore } from './store'

const BASE_URL = 'https://api.deepseek.com'

/** DeepSeek 视觉模型（实验版，图片按 token 计费，与 flash 同价） */
const VISION_MODEL = 'deepseek-v4-flash-vision-exp'

export type VisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

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

// deepseek-flash 空闲时段价格（元 / 百万 token），用于本地费用估算
const PRICE_INPUT = 1
const PRICE_OUTPUT = 4

const TRANSLATE_SYSTEM =
  '你是资深游戏/影视本地化译员。请把用户提供的台词逐句翻译，要求：忠实原意、保留口语感与语气、不添加原文没有的内容。'

function buildSystemPrompt(background?: string): string {
  let sys = TRANSLATE_SYSTEM
  if (background) sys += `\n\n【任务背景 / 语境】\n${background}`
  return sys
}

class LLM {
  getApiKey(): string {
    const enc = getStore().get('apiKeyEncrypted')
    if (!enc) return ''
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(enc, 'base64'))
      }
      // 极端情况回退明文（仍本地存储）
      return Buffer.from(enc, 'base64').toString('utf-8')
    } catch {
      return ''
    }
  }

  setApiKey(key: string): void {
    if (!key) {
      getStore().set('apiKeyEncrypted', '')
      return
    }
    const enc = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(key).toString('base64')
      : Buffer.from(key, 'utf-8').toString('base64')
    getStore().set('apiKeyEncrypted', enc)
  }

  hasApiKey(): boolean {
    return this.getApiKey().length > 0
  }

  getUsage(): UsageStats {
    return getStore().get('usageStats')
  }

  private activeController: AbortController | null = null

  /** 中止当前进行中的 AI 请求 */
  abort(): void {
    if (this.activeController) {
      this.activeController.abort()
      this.activeController = null
    }
  }

  /** 为新的 AI 请求创建 signal，同时中止上一个请求 */
  private newSignal(): AbortSignal {
    this.abort()
    const controller = new AbortController()
    this.activeController = controller
    return controller.signal
  }

  private recordUsage(promptTokens: number, completionTokens: number): void {
    const s = getStore().get('usageStats')
    const cost = (promptTokens / 1e6) * PRICE_INPUT + (completionTokens / 1e6) * PRICE_OUTPUT
    getStore().set('usageStats', {
      promptTokens: s.promptTokens + promptTokens,
      completionTokens: s.completionTokens + completionTokens,
      estimatedCost: s.estimatedCost + cost
    })
  }

  async getBalance(): Promise<BalanceInfo | null> {
    const key = this.getApiKey()
    if (!key) throw new Error('未配置 API Key')
    const res = await fetch(`${BASE_URL}/user/balance`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`余额查询失败 HTTP ${res.status}`)
    const data = (await res.json()) as { balance_infos?: BalanceInfo[] }
    return data.balance_infos?.[0] ?? null
  }

  /** 连接测试：查余额，能返回即表示 Key 有效 */
  async testConnection(): Promise<BalanceInfo | null> {
    return this.getBalance()
  }

  /** 批量翻译台词，返回与输入等长的译文数组 */
  async translateLines(lines: string[], targetLang = '中文', background = ''): Promise<string[]> {
    const key = this.getApiKey()
    if (!key) throw new Error('未配置 API Key')

    const user = JSON.stringify({
      type: 'translate_batch',
      lines: lines.map((text, i) => ({ id: `l${i}`, text }))
    })

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'deepseek-flash',
        messages: [
          { role: 'system', content: buildSystemPrompt(background) },
          {
            role: 'user',
            content: `${user}\n\n请输出 JSON：{"translations":[{"id":"l0","translation":"译文"},...]}，译文使用${targetLang}。`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000
      })
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`翻译失败 HTTP ${res.status} ${text.slice(0, 120)}`)
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const content = data.choices?.[0]?.message?.content ?? ''
    let translations: string[]
    try {
      const parsed = JSON.parse(content) as {
        translations?: { id: string; translation: string }[]
      }
      const map = new Map((parsed.translations ?? []).map((t) => [t.id, t.translation]))
      translations = lines.map((_, i) => map.get(`l${i}`) ?? '')
    } catch {
      translations = [content]
    }

    this.recordUsage(data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0)

    return translations
  }

  /** 深解某句台词：俚语/梗/文化背景/语法（flash） */
  async explainLine(text: string, translation: string, background = ''): Promise<string> {
    const key = this.getApiKey()
    if (!key) throw new Error('未配置 API Key')

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'deepseek-flash',
        messages: [
          {
            role: 'system',
            content:
              '你是游戏/影视台词解析专家。对给定的台词做简明深度解析：① 俚语/口语/双关/文化梗的含义 ② 难词或关键短语 ③ 翻译处理思路。用简洁的分点中文回答，不超过 200 字。'
          },
          {
            role: 'user',
            content: `原句：${text}\n当前译文：${translation}${background ? `\n背景：${background}` : ''}\n\n请解析。`
          }
        ],
        temperature: 0.3,
        max_tokens: 600
      })
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`解析失败 HTTP ${res.status} ${body.slice(0, 120)}`)
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    this.recordUsage(data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0)
    return data.choices?.[0]?.message?.content ?? ''
  }

  /** 视觉模型调用（多模态） */
  async vision(system: string, userContent: VisionContentPart[]): Promise<string> {
    const key = this.getApiKey()
    if (!key) throw new Error('未配置 API Key')

    const signal = this.newSignal()
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent }
        ],
        temperature: 0.3,
        max_tokens: 8000
      }),
      signal
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`视觉识别失败 HTTP ${res.status} ${body.slice(0, 200)}`)
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    this.recordUsage(data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0)
    return data.choices?.[0]?.message?.content ?? ''
  }

  /** 快速对话翻译：多张字幕截图 → 分批识别 + 忽略重复 + 中英对照 */
  async translateDialogueVision(images: string[], background = ''): Promise<string> {
    // 视觉模型对多图理解有限（单次太多只关注前几张），分批处理再合并
    const BATCH = 4
    const total = Math.ceil(images.length / BATCH)
    const parts: string[] = []
    for (let i = 0; i < images.length; i += BATCH) {
      const batch = images.slice(i, i + BATCH)
      const text = await this.translateBatch(batch, background, i / BATCH + 1, total)
      if (text.trim()) parts.push(text)
    }
    return parts.join('\n\n')
  }

  private async translateBatch(
    images: string[],
    background: string,
    idx: number,
    total: number
  ): Promise<string> {
    const parts: VisionContentPart[] = [
      {
        type: 'text',
        text:
          `以下是第 ${idx}/${total} 批字幕截图（按时间顺序）。请识别每一张图片中的对话台词，忽略重复出现的字幕，逐句给出中英对照翻译。\n` +
          '输出格式（每句英文原文下面紧跟中文译文，句子之间空一行）：\n' +
          'It was a lazy day.\n' +
          '那是慵懒的一天。\n\n' +
          '请务必使用纯文本格式，不要输出 JSON、表格或任何代码块。'
      },
      ...images.map((img) => ({
        type: 'image_url' as const,
        image_url: { url: `data:image/jpeg;base64,${img}` }
      }))
    ]
    return this.vision(buildSystemPrompt(background), parts)
  }

  /** 长文本翻译：单张截图 → 识别 + 逐句详细解析 */
  async translateTextVision(image: string, background = ''): Promise<string> {
    const parts: VisionContentPart[] = [
      {
        type: 'text',
        text:
          '请识别图片中的全部文字内容，并逐句详细解析：按顺序给出每一句的原文与译文，并对关键术语、文化梗、翻译思路做简要说明。\n' +
          '请使用清晰的分点纯文本格式输出，不要使用 JSON 或代码块。'
      },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }
    ]
    return this.vision(buildSystemPrompt(background), parts)
  }

  /** 通用对话（带历史与背景），用于追问 / 自由交互 */
  async chat(
    history: { role: 'user' | 'assistant'; content: string }[],
    background = ''
  ): Promise<string> {
    const key = this.getApiKey()
    if (!key) throw new Error('未配置 API Key')

    const system = `你是游戏/影视翻译与解析助手，帮助用户理解游戏/影视内容。${
      background ? `\n任务背景/语境：${background}` : ''
    }`

    const signal = this.newSignal()
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'deepseek-flash',
        messages: [{ role: 'system', content: system }, ...history],
        temperature: 0.3,
        max_tokens: 2000
      }),
      signal
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`对话失败 HTTP ${res.status} ${body.slice(0, 120)}`)
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    this.recordUsage(data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0)
    return data.choices?.[0]?.message?.content ?? ''
  }

  /** 长文本详细解析（flash）：逐句译文 + 术语/梗/翻译思路说明 */
  async translateDetailed(text: string, background = ''): Promise<string> {
    const key = this.getApiKey()
    if (!key) throw new Error('未配置 API Key')

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'deepseek-flash',
        messages: [
          {
            role: 'system',
            content:
              '你是游戏/影视文本解析专家。对用户提供的大段文本做逐句详细解析：按顺序给出每一句的原文与译文，并对关键术语、文化梗、翻译思路做简要说明。用清晰的分点中文输出。'
          },
          {
            role: 'user',
            content: `${background ? `背景：${background}\n\n` : ''}文本内容：\n${text}\n\n请逐句解析。`
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`解析失败 HTTP ${res.status} ${body.slice(0, 120)}`)
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    this.recordUsage(data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0)
    return data.choices?.[0]?.message?.content ?? ''
  }
}

export const llm = new LLM()
