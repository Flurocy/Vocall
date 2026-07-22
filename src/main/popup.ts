import { BrowserWindow, screen } from 'electron'
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

export function showPopup(win: BrowserWindow, expr: Expression): void {
  win.webContents.send('popup:show', expr)
  win.showInactive()
}

export function hidePopup(win: BrowserWindow): void {
  win.hide()
}
