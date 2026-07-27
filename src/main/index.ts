import { app, BrowserWindow, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { seedIfEmpty } from './seed'
import { createPopupWindow, registerPopupIpc } from './popup'
import { startEngine } from './engine'
import { fillLearningQueue } from './scheduler'
import { createTray } from './tray'
import { migrateVocabStatus, migrateSrsToPop } from './store'
import { migrateReviewSteps } from './settings'

// 窗口引用提升为模块级：托盘「打开」需要找回管理窗口，退出清理需要销毁弹窗
let managerWin: BrowserWindow | null = null
let popupWin: BrowserWindow | null = null
// 关闭=隐藏到托盘（背词工具常驻特性，简报决策）；托盘「退出」置 isQuitting 后真退
let isQuitting = false

function createManagerWindow(): void {
  const win = new BrowserWindow({
    width: 960,
    height: 640,
    // frame:false 彻底去原生框（用户反馈的白边），标题栏由渲染端自绘（TitleBar.tsx），
    // 拖拽区靠 -webkit-app-region: drag；浅色底消除加载闪深/闪白。
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setMenuBarVisibility(false) // 彻底移除 File/Edit/View/Window 菜单栏
  // 关闭按钮（含自绘标题栏 ✕）= 隐藏到托盘，不真退；isQuitting 时放行
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => { managerWin = null })
  managerWin = win
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL + '/manager/index.html')
  } else {
    win.loadFile(join(__dirname, '../renderer/manager/index.html'))
  }
}

// 托盘「打开 Tasymize」：已有窗口则显示聚焦，已被销毁则重建
function openManager(): void {
  if (managerWin && !managerWin.isDestroyed()) {
    managerWin.show()
    managerWin.focus()
  } else {
    createManagerWindow()
  }
}

// 自绘标题栏窗口控制 IPC：优先作用于事件发送者所在窗口，兜底管理窗口
function registerWindowIpc(): void {
  const target = (e: IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(e.sender) ?? managerWin
  ipcMain.handle('win:minimize', (e) => target(e)?.minimize())
  ipcMain.handle('win:maximize', (e) => {
    const w = target(e)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  // close 事件在上方被拦截为隐藏到托盘，故这里不是真退
  ipcMain.handle('win:close', (e) => target(e)?.close())
}

app.whenReady().then(() => {
  migrateVocabStatus() // 旧词补 status/book 默认值（幂等），须在 seed 前跑
  migrateSrsToPop()    // 旧 SRS 时间模型 → 弹窗节拍模型（幂等）
  migrateReviewSteps() // review_steps_pops 旧默认 → 新默认（幂等；用户自定义不动）
  const seeded = seedIfEmpty()
  if (seeded > 0) console.log(`[seed] 首次启动，导入 ${seeded} 条内置生词`)
  registerIpc()
  registerWindowIpc()
  createManagerWindow()
  popupWin = createPopupWindow()
  registerPopupIpc(() => popupWin as BrowserWindow)
  fillLearningQueue() // 启动即把 learning 队列补满（词书 new 词解锁进来）
  startEngine(() => popupWin as BrowserWindow)
  createTray(openManager, () => {
    // 退出彻底性：先销毁弹窗，避免 frameless 窗口残留成僵尸进程
    if (popupWin && !popupWin.isDestroyed()) popupWin.destroy()
  })
  app.on('activate', openManager)
})

// 真退前放行所有 close 拦截；引擎为 setTimeout 链，进程退出即随之终止
app.on('before-quit', () => { isQuitting = true })

// 有托盘常驻：关窗不退出（即使 popup 也被销毁），靠托盘「退出」收尾
app.on('window-all-closed', () => { /* 托盘常驻，不 quit */ })
