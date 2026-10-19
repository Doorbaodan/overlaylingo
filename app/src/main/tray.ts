import { app, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import { windows } from './windows'

let tray: Tray | null = null

export function createTray(): void {
  if (tray) return

  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources', 'tray.png'))
  tray = new Tray(icon)
  tray.setToolTip('浮译 OverlayLingo')

  const menu = Menu.buildFromTemplate([
    { label: '打开主窗口', click: () => windows.showMain() },
    { type: 'separator' },
    { label: '退出', click: () => windows.quit() }
  ])

  tray.setContextMenu(menu)
  tray.on('double-click', () => windows.showMain())
}
