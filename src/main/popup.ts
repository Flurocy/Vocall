import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import type { Expression } from './expressions'

export function createPopupWindow(): BrowserWindow {
  const { workAreaSize, workArea } = screen.getPrimaryDisplay()
  const width = 360
  const height = 200
  const x = workArea.x + workAreaSize.width - width - 24
  const y = workArea.y + workAreaSize.height - height - 24

  const win = new BrowserWindow({
    width, height, x, y,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, focusable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL + '/popup/popup.html')
  } else {
    win.loadFile(join(__dirname, '../renderer/popup/popup.html'))
  }
  return win
}

// 当前待展示的表达块：showPopup 先存后发，渲染端可用 popup:getCurrent 主动拉取。
// 这样即使 'popup:show' 推送早于页面 did-finish-load 被丢弃，
// 卡片 mount 后也能 pull 到数据，不会首弹空白。
let currentExpr: Expression | null = null

export function showPopup(win: BrowserWindow, expr: Expression): void {
  currentExpr = expr
  win.webContents.send('popup:show', expr)
  win.showInactive()
}

export function hidePopup(win: BrowserWindow): void {
  win.hide()
}

export function registerPopupIpc(getPopup: () => BrowserWindow): void {
  ipcMain.handle('popup:getCurrent', () => currentExpr)
  ipcMain.handle('popup:dismiss', () => hidePopup(getPopup()))
}
