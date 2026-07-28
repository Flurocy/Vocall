import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import type { VocabItem } from './vocab'
import type { PopupPayload } from '../shared/ipc-types'
import { getSrsState } from './store'
import { getSetting } from './settings'

export function createPopupWindow(): BrowserWindow {
  const { workAreaSize, workArea } = screen.getPrimaryDisplay()
  const width = 360
  const height = 240 // 背面多了例句开关，比 200 略高
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

// 当前待展示的生词：showPopup 先存后发，渲染端可用 popup:getCurrent 主动拉取。
// 这样即使 'popup:show' 推送早于页面 did-finish-load 被丢弃，
// 卡片 mount 后也能 pull 到数据，不会首弹空白。
// 载荷带连续答对进度（repetitions/passCount），弹窗用来显示 "已连续答对 x/N"。
let current: PopupPayload | null = null
// 自动隐藏定时器（主端统管）：showPopup 设，dismiss / 下个 showPopup 清。
// 取代旧版"渲染端 stayMs 定时器调 dismiss"——旧版在 popup_interval ≈ popup_stay 时，
// 上个弹窗的 stayMs hide 会恰好覆盖本次 showPopup 的 show（弹窗"闪一下消失"）。
// 主端统管后，下个 showPopup 直接 clearTimeout 上个 hide，竞态根除。
let hideTimer: NodeJS.Timeout | null = null

export function showPopup(win: BrowserWindow, item: VocabItem): void {
  // 新弹窗到达：取消上个弹窗的自动隐藏，避免它的 hide 覆盖本次 show
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  current = {
    item,
    repetitions: getSrsState(item.id)?.repetitions ?? 0,
    passCount: Math.max(1, Number(getSetting('pass_count')) || 3),
    forgotCount: getSrsState(item.id)?.forgotCount ?? 0,
  }
  win.webContents.send('popup:show', item)
  win.showInactive()
  // 自动隐藏：popup_stay_sec 秒后 hide。下个 showPopup 会取消它。
  const stayMs = Math.max(1, Number(getSetting('popup_stay_sec')) || 15) * 1000
  hideTimer = setTimeout(() => { hidePopup(win); hideTimer = null }, stayMs)
}

export function hidePopup(win: BrowserWindow): void {
  win.hide()
}

export function registerPopupIpc(getPopup: () => BrowserWindow): void {
  ipcMain.handle('popup:getCurrent', () => current)
  ipcMain.handle('popup:dismiss', () => {
    // 用户主动关闭（答题/标掌握）：取消待执行的自动隐藏，立即 hide
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
    hidePopup(getPopup())
  })

  // 整窗拖拽（frameless + focusable:false 下自实现）：
  // 渲染端 mousedown 时上报鼠标 screen 坐标作基准，mousemove 上报新坐标，
  // 主进程按位移平移窗口。用 ipcMain.on（fire-and-forget），不是 handle。
  let dragBase: { mouseX: number; mouseY: number; winX: number; winY: number } | null = null
  ipcMain.on('popup:dragStart', (_e, p: { x: number; y: number }) => {
    const win = getPopup()
    if (win.isDestroyed()) return
    const [winX, winY] = win.getPosition()
    dragBase = { mouseX: p.x, mouseY: p.y, winX, winY }
  })
  ipcMain.on('popup:dragMove', (_e, p: { x: number; y: number }) => {
    const win = getPopup()
    if (!dragBase || win.isDestroyed()) return
    win.setPosition(
      Math.round(dragBase.winX + (p.x - dragBase.mouseX)),
      Math.round(dragBase.winY + (p.y - dragBase.mouseY)),
    )
  })
}
