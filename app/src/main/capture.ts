import { BrowserWindow, desktopCapturer, screen, session } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { getStore, type Rect } from './store'
import { windows } from './windows'

const PRELOAD = join(__dirname, '../preload/index.js')
const RENDERER = join(__dirname, '../renderer/index.html')

/** 屏幕外坐标（后台运行，不遮挡用户） */
const OFFSCREEN = -10000
/** 单次收集最多累积的截图数 */
const MAX_IMAGES = 40

function loadRoute(win: BrowserWindow, route: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${route}`)
  } else {
    win.loadFile(RENDERER, { hash: `/${route}` })
  }
}

export interface CaptureInit {
  roiLocal: { x: number; y: number; width: number; height: number } | null
  displayWidth: number
  displayHeight: number
}

class CaptureManager {
  private win: BrowserWindow | null = null
  private previewVisible = false

  // 手动收集状态（快速对话翻译）
  private collecting = false
  private images: string[] = []
  private onDraft: ((count: number) => void) | null = null
  private pendingCollect: (() => void) | null = null
  private onCollectEvent: ((event: 'started' | 'cancelled') => void) | null = null

  // 截图翻译状态（长文本翻译）
  private pendingScreenshot: (() => void) | null = null
  private onScreenshotImage: ((image: string) => void) | null = null

  /** app ready 后调用一次：拦截 getDisplayMedia */
  setup(): void {
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          const roi = getStore().get('captureRegion')
          const source = this.pickSource(sources, roi)
          if (source) callback({ video: source })
          else callback({})
        })
        .catch(() => callback({}))
    })
  }

  private pickSource(
    sources: Electron.DesktopCapturerSource[],
    roi: Rect | null
  ): Electron.DesktopCapturerSource | undefined {
    if (!sources.length) return undefined
    if (roi?.displayId != null) {
      const match = sources.find(
        (s) => Number((s as unknown as { display_id?: string }).display_id) === roi.displayId
      )
      if (match) return match
    }
    return sources[0]
  }

  /** 开始手动收集（对话翻译）。始终先弹出框选，用户确认后开始收集 */
  startCollecting(
    onDraft: (count: number) => void,
    onEvent: (event: 'started' | 'cancelled') => void
  ): void {
    this.onDraft = onDraft
    this.onCollectEvent = onEvent
    this.pendingCollect = () => {
      this.doStartCollecting()
      this.onCollectEvent?.('started')
    }
    windows.createSelection()
  }

  /** 框选被取消：清理待执行的收集/截图 */
  cancelPending(): void {
    if (this.pendingCollect) {
      this.pendingCollect = null
      this.onCollectEvent?.('cancelled')
      this.onCollectEvent = null
      this.onDraft = null
    }
    if (this.pendingScreenshot) {
      this.pendingScreenshot = null
      const cb = this.onScreenshotImage
      this.onScreenshotImage = null
      cb?.('')
    }
  }

  private doStartCollecting(): void {
    this.collecting = true
    this.images = []
    this.start()
  }

  /** 停止收集，返回累积的字幕截图（base64 JPEG） */
  stopCollecting(): string[] {
    this.collecting = false
    const imgs = [...this.images]
    this.images = []
    this.onDraft = null
    return imgs
  }

  isCollecting(): boolean {
    return this.collecting
  }

  /** 框选确认后调用：若之前在等待收集/截图，则开始 */
  onSelectionConfirmed(): void {
    if (this.pendingCollect) {
      const fn = this.pendingCollect
      this.pendingCollect = null
      fn()
    }
    if (this.pendingScreenshot) {
      const fn = this.pendingScreenshot
      this.pendingScreenshot = null
      setTimeout(fn, 200) // 等遮罩窗口销毁后再截帧
    }
  }

  /** 截图翻译（长文本）：始终先框选一帧 → 截图为 base64 → 回调 */
  requestScreenshot(onImage: (image: string) => void): void {
    this.onScreenshotImage = onImage
    this.pendingScreenshot = () => void this.doScreenshot()
    windows.createSelection()
  }

  private async doScreenshot(): Promise<void> {
    try {
      // 截图前隐藏自身窗口（避免被截进图片）
      windows.hideForScreenshot()
      await new Promise((r) => setTimeout(r, 200))
      const image = await this.captureFrameImage()
      windows.showAfterScreenshot()
      if (this.onScreenshotImage) this.onScreenshotImage(image)
    } catch (err) {
      console.warn('[capture] 截图失败:', err)
      windows.showAfterScreenshot()
      if (this.onScreenshotImage) this.onScreenshotImage('')
    } finally {
      this.onScreenshotImage = null
    }
  }

  /** 截取当前 ROI 一帧，返回 base64 JPEG */
  private async captureFrameImage(): Promise<string> {
    const roi = getStore().get('captureRegion')
    if (!roi) return ''
    const displays = screen.getAllDisplays()
    const disp =
      (roi.displayId && displays.find((d) => d.id === roi.displayId)) || displays[0]
    const scale = disp.scaleFactor
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(disp.bounds.width * scale),
        height: Math.round(disp.bounds.height * scale)
      }
    })
    const source = this.pickSource(sources, roi)
    if (!source?.thumbnail) return ''
    const cx = Math.round((roi.x - disp.bounds.x) * scale)
    const cy = Math.round((roi.y - disp.bounds.y) * scale)
    const cw = Math.max(1, Math.round(roi.width * scale))
    const ch = Math.max(1, Math.round(roi.height * scale))
    const cropped = source.thumbnail.crop({ x: cx, y: cy, width: cw, height: ch })
    return cropped.toJPEG(85).toString('base64')
  }

  /** 启动捕获（后台窗口，屏幕外持续取帧） */
  private start(): void {
    if (this.win) {
      this.win.show()
      return
    }

    this.win = new BrowserWindow({
      width: 560,
      height: 360,
      minWidth: 320,
      minHeight: 200,
      show: false,
      autoHideMenuBar: true,
      title: '捕获 · 浮译',
      backgroundColor: '#17171b',
      skipTaskbar: true,
      webPreferences: {
        preload: PRELOAD,
        sandbox: false
      }
    })

    this.win.webContents.setBackgroundThrottling(false)

    this.win.on('ready-to-show', () => {
      this.win?.show()
      this.positionPreview()
    })
    this.win.on('closed', () => {
      this.win = null
      this.previewVisible = false
    })

    loadRoute(this.win, 'capture')
  }

  togglePreview(): void {
    this.previewVisible = !this.previewVisible
    this.positionPreview()
  }

  private positionPreview(): void {
    if (!this.win) return
    if (this.previewVisible) {
      const wa = screen.getPrimaryDisplay().workArea
      this.win.setPosition(wa.x + wa.width - 580, wa.y + wa.height - 380)
    } else {
      this.win.setPosition(OFFSCREEN, OFFSCREEN)
    }
  }

  getInit(): CaptureInit {
    const roi = getStore().get('captureRegion')
    const displays = screen.getAllDisplays()
    const disp =
      (roi?.displayId && displays.find((d) => d.id === roi.displayId)) ||
      displays.find((d) => d.id === screen.getPrimaryDisplay().id) ||
      displays[0]

    return {
      roiLocal: roi
        ? {
            x: roi.x - disp.bounds.x,
            y: roi.y - disp.bounds.y,
            width: roi.width,
            height: roi.height
          }
        : null,
      displayWidth: disp.bounds.width,
      displayHeight: disp.bounds.height
    }
  }

  /** 收到稳定帧（JPEG）：累积（renderer 已做内容去重） */
  onFrame(buf: ArrayBuffer): void {
    if (!this.collecting) return
    if (this.images.length >= MAX_IMAGES) return
    this.images.push(Buffer.from(buf).toString('base64'))
    if (this.onDraft) this.onDraft(this.images.length)
  }
}

export const capture = new CaptureManager()
