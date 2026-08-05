import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import type { VocabItem } from './vocab'
import type { PopupPayload, PreviewOverrides } from '../shared/ipc-types'
import { getSrsState } from './store'
import { getSetting } from './settings'

// 弹窗基础尺寸（scale=1.0 时的物理像素）。实际尺寸 = base × popup_scale。
const BASE_W = 360
const BASE_H = 240 // 背面多了例句开关，比 200 略高

// 读 popup_scale 设置并 clamp 到 0.8–1.5（与 theme.ts POPUP_SCALE 范围同步）。
// 解析策略与 theme.ts getPopupScale 一致：parseFloat（'12abc'→12）+ Number.isNaN 判非法；
// 空/NaN → 1。0 合法走 clamp（→0.8），不再当 falsy 兜底（M1：原 Number||1 把 0 当非法）。
function readScale(): number {
  const n = parseFloat(getSetting('popup_scale') ?? '')
  if (Number.isNaN(n)) return 1
  return Math.min(1.5, Math.max(0.8, n))
}

// 读 popup_opacity 设置并 clamp 到 0.5–1.0（与 theme.ts POPUP_OPACITY 同步）。非法/空/NaN → 1。
function readOpacity(): number {
  const n = parseFloat(getSetting('popup_opacity') ?? '')
  if (Number.isNaN(n)) return 1
  return Math.min(1.0, Math.max(0.5, n))
}

// 按 scale 算实际 w/h，并锚右下角（贴边 24px，workArea 相对）。
// scaleOverride：预览拖动中的临时值（未提交设置）；不传则读设置。
function popupBounds(scaleOverride?: number): { x: number; y: number; width: number; height: number } {
  const { workAreaSize, workArea } = screen.getPrimaryDisplay()
  const width = Math.round(BASE_W * (scaleOverride ?? readScale()))
  const height = Math.round(BASE_H * (scaleOverride ?? readScale()))
  const x = workArea.x + workAreaSize.width - width - 24
  const y = workArea.y + workAreaSize.height - height - 24
  return { x, y, width, height }
}

export function createPopupWindow(): BrowserWindow {
  const { x, y, width, height } = popupBounds()

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
  // 启动即按用户透明度（transparent:true 窗口可直接 setOpacity）。
  win.setOpacity(readOpacity())
  return win
}

// 设置页改 popup_scale 后实时改尺寸：重算 bounds 并一次 setBounds（x/y/w/h 同设，避免抖动）。
// win 为 null（弹窗尚未创建）或已销毁 → no-op。
export function resizePopup(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  win.setBounds(popupBounds())
}

// 设置页改 popup_opacity 后实时改透明度。win 为 null/已销毁 → no-op。
export function applyPopupOpacity(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  win.setOpacity(readOpacity())
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
// 窗口可见性：hidePopup 只 hide 不清 current（自动隐藏后 current 仍残留），
// 预览防护要判断的是"真词正显示着"而非"有过真词"，必须单独跟踪。
let visible = false
// —— 预览态（设置页调外观滑块的实时预览）——
// 冲突防护三规则：①真词正显示(visible && !previewing)→拒绝预览 ②预览中引擎弹真词
// →真词无条件接管(showPopup 清预览态) ③预览词 id=-1，评分/掌握 IPC 拦截不调度。
let previewing = false
// 松手后 3s 自动收起预览的定时器（endPreview 设；再拖动/真词接管/主动关闭则清）
let previewReleaseTimer: NodeJS.Timeout | null = null
// 预览演示词（id=-1 标记：评分/掌握据此拦截；渲染端据此静音+显示"预览"徽标）
const PREVIEW_ITEM: VocabItem = {
  id: -1, word: 'preview', meaning: 'n. 预览；预演',
  example: 'Drag the sliders in Settings to preview size, opacity and font live.',
  topic: null, book: null, status: 'learning', source: '预览', created_at: 0,
}

// 预览的临时外观值 PreviewOverrides 定义在 shared/ipc-types.ts（拖动中不提交设置——防每帧
// 全量写盘——由预览直接应用到窗口/卡片；松手提交后由 settings:set 正常链路按同值再应用，无跳变）。

export function showPopup(win: BrowserWindow, item: VocabItem): void {
  // 防护规则②：预览进行中真词来了——真词无条件接管，预览态作废（预览永不反压真词）。
  if (previewing) {
    previewing = false
    if (previewReleaseTimer) { clearTimeout(previewReleaseTimer); previewReleaseTimer = null }
  }
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
  visible = true
  // 自动隐藏：popup_stay_sec 秒后 hide。下个 showPopup 会取消它。
  const stayMs = Math.max(1, Number(getSetting('popup_stay_sec')) || 15) * 1000
  hideTimer = setTimeout(() => { hidePopup(win); hideTimer = null }, stayMs)
}

export function hidePopup(win: BrowserWindow): void {
  visible = false
  win.hide()
}

// —— 外观预览（设置页拖"界面大小/透明度/弹窗字体"滑块时实时所见）——
// 防护规则①：真词正显示（visible && !previewing）→ 拒绝预览，返回 false（真词优先）。
// 预览不设 stayMs 自动隐藏（拖到多久都行），由 endPreview 的 3s 释放定时器收起。
// overrides 是拖动中的临时值：直接应用到窗口/卡片，不写设置（防每帧全量写盘）。
export function previewPopup(win: BrowserWindow, overrides: PreviewOverrides = {}): boolean {
  if (win.isDestroyed()) return false
  if (visible && !previewing) return false // 规则①
  previewing = true
  if (previewReleaseTimer) { clearTimeout(previewReleaseTimer); previewReleaseTimer = null } // 连续拖动重置收起倒计时
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null } // 防御：预览期间不应有真词 hide 计时
  current = {
    item: PREVIEW_ITEM,
    repetitions: 0,
    passCount: 3,
    forgotCount: 0,
    preview: true, // 渲染端据此静音 + 显示"预览"徽标
    fontScaleOverride: overrides.fontScale, // 字体临时值经卡片 zoom 生效（字体无窗口级 API）
  }
  // 尺寸/透明度临时值直接作用窗口（窗口级效果，即拖即变）；clamp 与正常链路一致
  if (overrides.scale !== undefined) {
    win.setBounds(popupBounds(Math.min(1.5, Math.max(0.8, overrides.scale))))
  }
  if (overrides.opacity !== undefined) {
    win.setOpacity(Math.min(1.0, Math.max(0.5, overrides.opacity)))
  }
  win.webContents.send('popup:show', PREVIEW_ITEM)
  win.showInactive()
  visible = true
  return true
}

// 松手后调用：3s 后自动收起预览（留时间看清最终效果）。期间再拖动会重置倒计时。
export function endPreview(win: BrowserWindow): void {
  if (!previewing || win.isDestroyed()) return
  if (previewReleaseTimer) clearTimeout(previewReleaseTimer)
  previewReleaseTimer = setTimeout(() => {
    previewReleaseTimer = null
    if (!previewing) return // 期间真词已接管（规则②），不动窗口
    previewing = false
    hidePopup(win)
  }, 3000)
}

// 测试专用：读预览态（断防护规则用）
export function _previewState(): { previewing: boolean; visible: boolean } {
  return { previewing, visible }
}

// 测试专用：清模块态（弹窗是单例模块态，跨用例残留 visible/previewing 会互相干扰）
export function _resetPopupForTests(): void {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  if (previewReleaseTimer) { clearTimeout(previewReleaseTimer); previewReleaseTimer = null }
  current = null
  visible = false
  previewing = false
}

export function registerPopupIpc(getPopup: () => BrowserWindow): void {
  ipcMain.handle('popup:getCurrent', () => current)
  ipcMain.handle('popup:dismiss', () => {
    // 用户主动关闭（答题/标掌握）：取消待执行的自动隐藏，立即 hide
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
    // 预览态下关闭（点了预览卡的评分/掌握按钮）：同时清预览态与收起倒计时
    if (previewing) {
      previewing = false
      if (previewReleaseTimer) { clearTimeout(previewReleaseTimer); previewReleaseTimer = null }
    }
    hidePopup(getPopup())
  })
  // 外观预览：设置页拖滑块实时预览（rules 见 previewPopup 注释）。返回是否成功进入预览
  // （真词正显示时拒绝，前端可忽略——真词优先）。
  ipcMain.handle('popup:preview', (_e, overrides: PreviewOverrides) =>
    previewPopup(getPopup(), overrides ?? {}))
  ipcMain.handle('popup:endPreview', () => endPreview(getPopup()))

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
