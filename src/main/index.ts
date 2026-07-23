import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { seedIfEmpty } from './seed'
import { createPopupWindow, registerPopupIpc } from './popup'
import { startEngine } from './engine'

function createManagerWindow(): void {
  const win = new BrowserWindow({
    width: 960,
    height: 640,
    // 去白边：仅移除 File/Edit/View/Window 菜单栏（用户反馈那条"白边"主要是菜单栏），
    // 深色底消除加载闪白。不隐藏标题栏——titleBarStyle:'hidden' 会把右上角关闭按钮
    // 一并藏掉导致无法关闭窗口，故保留标准窗口框。
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setMenuBarVisibility(false) // 彻底移除 File/Edit/View/Window 菜单栏
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL + '/manager/index.html')
  } else {
    win.loadFile(join(__dirname, '../renderer/manager/index.html'))
  }
}

app.whenReady().then(() => {
  const seeded = seedIfEmpty()
  if (seeded > 0) console.log(`[seed] 首次启动，导入 ${seeded} 条内置生词`)
  registerIpc()
  createManagerWindow()
  const popup = createPopupWindow()
  registerPopupIpc(() => popup)
  startEngine(() => popup)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createManagerWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
