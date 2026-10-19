import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
type FontSize = 'small' | 'medium' | 'large'

interface Balance {
  currency: string
  total_balance: string
}

interface Usage {
  promptTokens: number
  completionTokens: number
  estimatedCost: number
}

export default function SettingsView() {
  const [theme, setTheme] = useState<Theme>('light')
  const [fontSize, setFontSize] = useState<FontSize>('medium')
  const [hasKey, setHasKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [balance, setBalance] = useState<Balance | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.settings.getTheme().then((t) => {
      setTheme(t)
      document.body.dataset.theme = t
    })
    window.api.settings.getFontSize().then((s) => {
      setFontSize(s)
      document.documentElement.dataset.fontSize = s
    })
    window.api.settings.getKeyStatus().then((s) => setHasKey(s.hasKey))
    window.api.settings.getUsage().then(setUsage)
  }, [])

  const changeTheme = (t: Theme): void => {
    setTheme(t)
    document.body.dataset.theme = t
    window.api.settings.setTheme(t)
  }

  const changeFontSize = (s: FontSize): void => {
    setFontSize(s)
    document.documentElement.dataset.fontSize = s
    window.api.settings.setFontSize(s)
  }

  const saveKey = (): void => {
    const k = apiKey.trim()
    window.api.settings.setApiKey(k)
    setHasKey(!!k)
    setApiKey('')
    setMsg(k ? 'API Key 已保存（加密存储于本机）' : '已清除 API Key')
  }

  const testConn = async (): Promise<void> => {
    setBusy(true)
    setMsg('')
    try {
      const b = await window.api.settings.testConnection()
      setBalance(b)
      setMsg(b ? '连接成功' : '未返回余额信息')
      window.api.settings.getUsage().then(setUsage)
    } catch (e) {
      setMsg('连接失败: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-view">
      <h2 className="settings-title">设置</h2>

      <section className="card">
        <h3>模型与余额</h3>
        <div className="setting-row">
          <label>API Key</label>
          <input
            type="password"
            className="key-input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? '已配置（重新输入可覆盖）' : '粘贴 DeepSeek API Key'}
          />
          <button className="btn" onClick={saveKey}>
            保存
          </button>
        </div>
        <div className="setting-row">
          <label>余额</label>
          <span className="value-text">{balance ? `${balance.total_balance} ${balance.currency}` : '未查询'}</span>
          <button className="btn" onClick={testConn} disabled={busy}>
            {busy ? '测试中…' : '测试连接'}
          </button>
        </div>
        {usage && (
          <div className="setting-row">
            <label>累计用量</label>
            <span className="value-text">
              {usage.promptTokens} 输入 · {usage.completionTokens} 输出 token · 约 ¥
              {usage.estimatedCost.toFixed(4)}
            </span>
          </div>
        )}
        {msg && <p className="hint">{msg}</p>}
      </section>

      <section className="card">
        <h3>外观</h3>
        <div className="setting-row">
          <label>主题</label>
          <div className="theme-switch">
            <button className={theme === 'light' ? 'active' : ''} onClick={() => changeTheme('light')}>
              浅色
            </button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => changeTheme('dark')}>
              深色
            </button>
          </div>
        </div>
        <div className="setting-row">
          <label>字体大小</label>
          <div className="theme-switch">
            <button className={fontSize === 'small' ? 'active' : ''} onClick={() => changeFontSize('small')}>
              小
            </button>
            <button className={fontSize === 'medium' ? 'active' : ''} onClick={() => changeFontSize('medium')}>
              中
            </button>
            <button className={fontSize === 'large' ? 'active' : ''} onClick={() => changeFontSize('large')}>
              大
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
