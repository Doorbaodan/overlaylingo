import { app, BrowserWindow, dialog } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { windows } from './windows'
import { capture } from './capture'
import { createTray } from './tray'
import { setupIpc } from './ipc'
import { getStore } from './store'
import { closeDb } from './db'

// 单实例锁：重复启动时提示并聚焦已有实例
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!app.isReady()) return
    windows.showMain()
    void dialog.showMessageBox({
      type: 'info',
      title: '浮译',
      message: '浮译已在运行',
      detail: '程序正在后台运行，已为你打开主窗口。'
    })
  })

  app.whenReady().then(() => {
    // Windows 任务栏分组与通知标识
    electronApp.setAppUserModelId('com.overlaylingo.app')

    // 初始化配置存储（懒加载单例，首次访问即读盘）
    getStore()

    // 开发模式 F12 打开 devtools，生产模式忽略 CommandOrControl+R
    app.on('browser-window-created', (_e, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    setupIpc()
    capture.setup() // 拦截 getDisplayMedia，自动授权 ROI 所在屏幕
    createTray()
    windows.createMain()
    windows.createBubble() // 启动即显示悬浮球（常驻入口）

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        windows.createMain()
      }
    })
  })
}

// 常驻托盘：关闭所有窗口后不退出，托盘菜单显式退出
app.on('window-all-closed', () => {
  /* 保持后台运行 */
})

// 退出前关闭数据库，执行 WAL checkpoint
app.on('will-quit', () => {
  closeDb()
})
