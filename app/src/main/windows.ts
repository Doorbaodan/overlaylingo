import { app, BrowserWindow, desktopCapturer, dialog, screen, shell, type Rectangle } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { getStore, type Rect } from './store'

const PRELOAD = join(__dirname, '../preload/index.js')
const RENDERER = join(__dirname, '../renderer/index.html')

/** 应用图标（资源随包分发，dev/打包后路径一致） */
const APP_ICON = join(app.getAppPath(), 'resources', 'icon.png')

/** 悬浮球尺寸（24px，不显眼） */
const BUBBLE_SIZE = 24
/** 弹窗默认尺寸 */
const DEFAULT_PANEL_SIZE = { width: 240, height: 170 }
/** 弹窗最小尺寸 */
const PANEL_MIN_SIZE = { width: 200, height: 140 }

function loadRoute(win: BrowserWindow, route: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${route}`)
  } else {
    win.loadFile(RENDERER, { hash: `/${route}` })
  }
}

export type OverlayMode = 'hidden' | 'bubble' | 'panel'

class WindowManager {
  private mainWin: BrowserWindow | null = null
  private bubbleWin: BrowserWindow | null = null
  private panelWin: BrowserWindow | null = null
  private selectionWin: BrowserWindow | null = null

  /** 悬浮窗系统状态 */
  overlayMode: OverlayMode = 'hidden'
  overlayClickThrough = false

  /** 面板 resize 防抖计时器 */
  private panelResizeTimer: NodeJS.Timeout | null = null

  /** 当前框选遮罩覆盖的显示器偏移 */
  private selectionOffset = { x: 0, y: 0 }
  /** 框选遮罩背景截图（dataURL），避免透明窗口干扰硬件视频 */
  private selectionBackground = ''
  /** 截图前隐藏窗口的状态记录 */
  private hiddenForShot: { bubble: boolean; panel: boolean; main: boolean } | null = null
  /** 是否正在真正退出（避免 close 拦截循环） */
  private quitting = false

  // ------------------------------------------------------------------ 主窗口

  createMain(): void {
    if (this.mainWin) {
      if (this.mainWin.isMinimized()) this.mainWin.restore()
      this.mainWin.show()
      this.mainWin.focus()
      return
    }

    this.mainWin = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 760,
      minHeight: 520,
      show: false,
      autoHideMenuBar: true,
      title: '浮译 OverlayLingo',
      icon: APP_ICON,
      backgroundColor: '#f5f6f8',
      webPreferences: {
        preload: PRELOAD,
        sandbox: false
      }
    })

    this.mainWin.on('ready-to-show', () => this.mainWin?.show())
    this.mainWin.on('close', (e) => {
      // 点 × 拦截：提示退出或最小化到托盘
      if (this.quitting) return
      e.preventDefault()
      void this.promptQuitOrTray()
    })
    this.mainWin.on('closed', () => {
      this.mainWin = null
    })

    this.mainWin.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    loadRoute(this.mainWin, 'main')
  }

  // ------------------------------------------------------------------ 悬浮球

  createBubble(): void {
    if (this.bubbleWin) return

    this.bubbleWin = new BrowserWindow({
      width: BUBBLE_SIZE,
      height: BUBBLE_SIZE,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        preload: PRELOAD,
        sandbox: false
      }
    })

    this.bubbleWin.setAlwaysOnTop(true, 'screen-saver')

    this.bubbleWin.on('ready-to-show', () => {
      this.bubbleWin?.setPosition(this.resolveBubblePosition().x, this.resolveBubblePosition().y)
      this.bubbleWin?.show()
    })

    this.bubbleWin.on('closed', () => {
      this.bubbleWin = null
    })

    loadRoute(this.bubbleWin, 'bubble')
  }

  private resolveBubblePosition(): { x: number; y: number } {
    const saved = getStore().get('overlay').bubblePosition
    if (saved) return saved
    const wa = screen.getPrimaryDisplay().workArea
    return {
      x: wa.x + wa.width - BUBBLE_SIZE - 16,
      y: wa.y + wa.height - BUBBLE_SIZE - 16
    }
  }

  /** 拖动悬浮球：位置仅由鼠标拖动改变 */
  moveBubble(x: number, y: number): void {
    if (!this.bubbleWin) return
    const nb = this.clampToDisplay({
      x: Math.round(x),
      y: Math.round(y),
      width: BUBBLE_SIZE,
      height: BUBBLE_SIZE
    })
    this.bubbleWin.setPosition(nb.x, nb.y)
    const overlay = getStore().get('overlay')
    overlay.bubblePosition = { x: nb.x, y: nb.y }
    getStore().save()
  }

  // ------------------------------------------------------------------ 弹窗（对话窗口）

  createPanel(): void {
    if (this.panelWin) return

    const saved = getStore().get('overlay').panelBounds
    const size = saved ? { width: saved.width, height: saved.height } : DEFAULT_PANEL_SIZE

    this.panelWin = new BrowserWindow({
      width: size.width,
      height: size.height,
      minWidth: PANEL_MIN_SIZE.width,
      minHeight: PANEL_MIN_SIZE.height,
      show: false,
      frame: false,
      transparent: true,
      resizable: true,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        preload: PRELOAD,
        sandbox: false
      }
    })

    this.panelWin.setAlwaysOnTop(true, 'screen-saver')

    // 首次创建（无记忆位置）：居中于悬浮球，而非屏幕中心
    if (!saved) {
      const bp = this.resolveBubblePosition()
      const pos = this.clampToDisplay({
        x: Math.round(bp.x + BUBBLE_SIZE / 2 - size.width / 2),
        y: Math.round(bp.y + BUBBLE_SIZE / 2 - size.height / 2),
        width: size.width,
        height: size.height
      })
      this.panelWin.setPosition(pos.x, pos.y)
    }

    // 记住用户拖动/拉伸后的位置与大小（防抖落盘）
    const saveBounds = (): void => {
      if (this.panelResizeTimer) clearTimeout(this.panelResizeTimer)
      this.panelResizeTimer = setTimeout(() => {
        if (!this.panelWin) return
        const b = this.panelWin.getBounds()
        getStore().get('overlay').panelBounds = { x: b.x, y: b.y, width: b.width, height: b.height }
        getStore().save()
      }, 300)
    }
    this.panelWin.on('resize', saveBounds)
    this.panelWin.on('move', saveBounds)

    this.panelWin.on('closed', () => {
      this.panelWin = null
      if (this.panelResizeTimer) clearTimeout(this.panelResizeTimer)
    })

    loadRoute(this.panelWin, 'panel')
  }

  // ------------------------------------------------------------------ 状态切换

  /** 点球 → 展开弹窗（隐藏球） */
  expandOverlay(): void {
    if (!this.panelWin) this.createPanel()
    this.bubbleWin?.hide()
    this.panelWin?.show()
    this.panelWin?.focus()
    this.overlayMode = 'panel'
  }

  /** 弹窗收起 → 恢复球 */
  collapseToBubble(): void {
    if (this.overlayMode !== 'panel') return
    this.panelWin?.hide()
    if (!this.bubbleWin) this.createBubble()
    this.bubbleWin?.show()
    this.overlayMode = 'bubble'
  }

  /** 显示球（启动 / 热键恢复） */
  showBubble(): void {
    if (!this.bubbleWin) this.createBubble()
    this.panelWin?.hide()
    this.bubbleWin!.show()
    this.overlayMode = 'bubble'
  }

  /** 全部隐藏 */
  hideAll(): void {
    this.bubbleWin?.hide()
    this.panelWin?.hide()
    this.overlayMode = 'hidden'
  }

  /** 全局热键 / 托盘：隐藏 ↔ 显示球 */
  toggleOverlay(): void {
    if (this.overlayMode === 'hidden') {
      this.showBubble()
    } else {
      this.hideAll()
    }
  }

  /** 面板「隐藏」按钮 → 全部隐藏 */
  hideOverlay(): void {
    this.hideAll()
  }

  /** 面板「最小化」按钮 → 收起为球 */
  collapseOverlay(): void {
    this.collapseToBubble()
  }

  /** 弹窗窗口引用（供其他模块推送数据） */
  getPanel(): BrowserWindow | null {
    return this.panelWin
  }

  /** 向主窗口和悬浮窗广播事件 */
  broadcast(channel: string, ...args: unknown[]): void {
    this.mainWin?.webContents.send(channel, ...args)
    this.panelWin?.webContents.send(channel, ...args)
  }

  /** 主程序最小化到悬浮球（用户回游戏） */
  minimizeMainToBubble(): void {
    this.mainWin?.minimize()
    if (!this.bubbleWin) this.createBubble()
    this.bubbleWin?.show()
  }

  /** 弹出并聚焦主程序 */
  showMain(): void {
    if (this.mainWin) {
      if (this.mainWin.isMinimized()) this.mainWin.restore()
      this.mainWin.show()
      this.mainWin.focus()
    }
  }

  /** 真正退出程序（托盘菜单「退出」调用） */
  quit(): void {
    this.quitting = true
    app.quit()
  }

  /** 点 × 提示：退出 or 最小化到托盘 */
  private async promptQuitOrTray(): Promise<void> {
    if (!this.mainWin) return
    const { response } = await dialog.showMessageBox(this.mainWin, {
      type: 'question',
      buttons: ['最小化至系统托盘', '直接退出'],
      defaultId: 0,
      cancelId: 0,
      title: '浮译',
      message: '关闭主程序窗口？',
      detail: '「最小化至系统托盘」程序后台继续运行（悬浮球仍可用）；「直接退出」将完全退出程序。'
    })
    if (response === 1) {
      this.quitting = true
      app.quit()
    } else {
      this.mainWin?.hide()
    }
  }

  /** 截图前隐藏自身窗口（记录状态） */
  hideForScreenshot(): void {
    this.hiddenForShot = {
      bubble: this.bubbleWin?.isVisible() ?? false,
      panel: this.panelWin?.isVisible() ?? false,
      main: this.mainWin?.isVisible() ?? false
    }
    this.bubbleWin?.hide()
    this.panelWin?.hide()
    this.mainWin?.hide()
  }

  /** 截图后恢复之前可见的窗口 */
  showAfterScreenshot(): void {
    if (!this.hiddenForShot) return
    const h = this.hiddenForShot
    this.hiddenForShot = null
    if (h.bubble) this.bubbleWin?.show()
    if (h.panel) this.panelWin?.show()
    if (h.main) this.mainWin?.show()
  }

  setOverlayClickThrough(v: boolean): void {
    this.overlayClickThrough = v
    if (this.panelWin) this.panelWin.setIgnoreMouseEvents(v, { forward: true })
  }

  private clampToDisplay(b: Rectangle): Rectangle {
    const disp = screen.getDisplayMatching(b)
    const wa = disp.workArea
    const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width)
    const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height)
    return { x, y, width: b.width, height: b.height }
  }

  // ------------------------------------------------------------------ 框选遮罩

  createSelection(): void {
    if (this.selectionWin) {
      // 已存在（可能因上次 close 未完成而隐藏），重新显示
      this.selectionWin.show()
      this.selectionWin.focus()
      return
    }

    const roi = getStore().get('captureRegion')
    const displays = screen.getAllDisplays()
    const target =
      (roi?.displayId && displays.find((d) => d.id === roi.displayId)) ||
      displays.find((d) => d.id === screen.getPrimaryDisplay().id) ||
      displays[0]

    this.selectionOffset = { x: target.bounds.x, y: target.bounds.y }
    this.selectionBackground = ''

    // 先截目标屏幕作为遮罩背景：透明置顶窗口会干扰浏览器硬件加速视频（导致黑屏），
    // 改用不透明窗口 + 静态截图背景，视频在后台正常播放。
    // 带超时保护：截图最久等 1.2s，避免异常挂起导致窗口不创建。
    const scale = target.scaleFactor
    const shot = desktopCapturer
      .getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(target.bounds.width * scale),
          height: Math.round(target.bounds.height * scale)
        }
      })
      .then((sources) => {
        const source =
          sources.find(
            (s) => Number((s as unknown as { display_id?: string }).display_id) === target.id
          ) ?? sources[0]
        if (source?.thumbnail) {
          this.selectionBackground = source.thumbnail.toDataURL()
        }
      })
      .catch(() => {})

    const guard = new Promise<void>((resolve) => setTimeout(resolve, 1200))
    void Promise.race([shot, guard]).then(() => this.doCreateSelectionWindow(target))
  }

  private doCreateSelectionWindow(target: Electron.Display): void {
    const { x, y, width, height } = target.bounds

    this.selectionWin = new BrowserWindow({
      x,
      y,
      width,
      height,
      show: false,
      frame: false,
      transparent: false,
      backgroundColor: '#101013',
      resizable: false,
      movable: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        preload: PRELOAD,
        sandbox: false
      }
    })

    this.selectionWin.setAlwaysOnTop(true, 'screen-saver')

    this.selectionWin.on('ready-to-show', () => this.selectionWin?.show())
    this.selectionWin.on('closed', () => {
      this.selectionWin = null
    })

    loadRoute(this.selectionWin, 'selection')
  }

  toggleSelection(): void {
    if (!this.selectionWin) {
      this.createSelection()
      return
    }
    if (this.selectionWin.isVisible()) {
      this.selectionWin.hide()
    } else {
      this.selectionWin.show()
      this.selectionWin.focus()
    }
  }

  closeSelection(): void {
    if (this.selectionWin) {
      this.selectionWin.close()
      this.selectionWin = null
    }
  }

  getSelectionInit(): {
    offset: { x: number; y: number }
    currentRoi: Rect | null
    background: string
  } {
    return {
      offset: this.selectionOffset,
      currentRoi: getStore().get('captureRegion'),
      background: this.selectionBackground
    }
  }

  saveCaptureRegion(rect: Rect): void {
    if (rect.displayId == null) {
      const d = screen.getDisplayNearestPoint({
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2
      })
      rect.displayId = d.id
    }
    getStore().set('captureRegion', rect)
  }
}

/** 全局单例 */
export const windows = new WindowManager()
