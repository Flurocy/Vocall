import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateInfo as ElectronUpdateInfo } from 'electron-updater'
import type { UpdateInfo, UpdateStatus } from '../shared/ipc-types'
import { getSetting, setSetting } from './settings'

// GitHub 仓库 owner/repo。dev 兜底检查访问 https://api.github.com/repos/{OWNER}/{REPO}/releases/latest。
const OWNER = 'Flurocy'
const REPO = 'Vocall'

// ————————————————————————————————————————————————————————————
// 覆盖式自动更新（v1.6.0）：electron-updater 主进程状态机。
//
// 架构：autoUpdater 是主进程单例，真正的 检查→下载→装 全在这里跑；弹窗 UI 在管理窗口（渲染端）。
// 因此走「主进程状态机 + webContents.send 推事件给渲染端」：
//   主进程订阅 autoUpdater 的 update-available / download-progress / update-downloaded / error，
//   规整成 UpdateStatus 经 'update:status' 推给渲染端；渲染端点「立即更新」再 invoke 'update:download' 回来。
//
// 关键开关（设计稿 3.2）：
//   autoDownload = false        下载手动确认——发现新版只弹卡片，用户点「立即更新」才 downloadUpdate()
//   autoInstallOnAppQuit = true 下好了用户没马上重启，退出时自动装
// ————————————————————————————————————————————————————————————

// 管理窗口引用（事件推送目标）。由 index.ts 通过 initAutoUpdater 注入 getter。
let getManagerWin: () => BrowserWindow | null = () => null

// 内存中最近一次推送的状态（渲染端挂载时可主动拉取，避免错过挂载前的事件）
let lastStatus: UpdateStatus = { state: 'idle' }

// 是否已初始化（防重复订阅）
let initialized = false

// —— 纯函数（可单测，不依赖 Electron 运行时）——

// 语义化版本比对：a > b → 1，相等 → 0，a < b → -1（按 . 分段比整数）。
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va > vb) return 1
    if (va < vb) return -1
  }
  return 0
}

// releaseNotes 规整：electron-updater 的 releaseNotes 可能是 string / {note}[] / null。
// 统一抽成纯文本字符串（数组取 note 拼接），渲染端直接当 Markdown 文本显示。
export function normalizeReleaseNotes(notes: ElectronUpdateInfo['releaseNotes']): string {
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) return notes.map((n) => n.note).filter(Boolean).join('\n\n')
  return ''
}

// 首启更新日志判定（设计稿 3.3 时机②）：当前版本 > 已读版本 → 该弹一次。
// current === lastSeen 表示这个版本的日志已看过（或刚标记），不再弹。
// lastSeen 为空串（从未标记）时：仅当 current 非空才弹——避免全新装的用户首启也被"更新日志"骚扰。
export function shouldShowChangelog(current: string, lastSeen: string): boolean {
  if (!current) return false
  if (current === lastSeen) return false
  // 首次安装（lastSeen 空）：不弹——用户没用旧版，没有"更新"概念。首次标记在启动时静默写入。
  if (!lastSeen) return false
  return compareVersions(current, lastSeen) > 0
}

// —— 状态推送 ——
function push(status: UpdateStatus): void {
  lastStatus = status
  const win = getManagerWin()
  if (win && !win.isDestroyed()) win.webContents.send('update:status', status)
}

// —— autoUpdater 事件订阅 ——
// 只在打包后调用（dev 下 autoUpdater 无 feed 配置会抛错）。
export function initAutoUpdater(getWin: () => BrowserWindow | null): void {
  if (initialized) return
  initialized = true
  getManagerWin = getWin

  autoUpdater.autoDownload = false // 下载手动确认
  autoUpdater.autoInstallOnAppQuit = true // 退出时自动装
  autoUpdater.logger = console // 日志进 console（Git Bash 调试用）

  autoUpdater.on('update-available', (info) => {
    push({
      state: 'available',
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    })
  })
  autoUpdater.on('update-not-available', () => {
    push({ state: 'none' })
  })
  autoUpdater.on('download-progress', (p) => {
    push({ state: 'downloading', percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    push({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    push({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  })
}

// 启动后静默检查一次（打包后）。发现新版 → update-available → 推 available 状态给渲染端弹卡片。
// 失败静默（error 事件已推送 error 状态，但启动检查不该打扰用户——渲染端对启动来源的 error 不弹窗）。
export function checkForUpdatesSilently(): void {
  if (!app.isPackaged) return
  autoUpdater.checkForUpdates().catch(() => { /* 静默：error 事件已处理 */ })
}

// 渲染端「立即更新」→ 开始下载（autoDownload=false 时手动触发）
export function downloadUpdate(): void {
  if (!app.isPackaged) return
  push({ state: 'downloading', percent: 0 })
  autoUpdater.downloadUpdate().catch((err) => {
    push({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  })
}

// 渲染端「重启完成更新」→ 退出并安装
export function quitAndInstall(): void {
  if (!app.isPackaged) return
  autoUpdater.quitAndInstall()
}

// 渲染端挂载时拉取最近一次状态（错过挂载前事件的兜底）
export function getUpdateStatus(): UpdateStatus {
  return lastStatus
}

// —— 手动检查（设置页「检查更新」按钮）——
// 打包后走 autoUpdater（事件经 push 推送，状态在渲染端卡片显示）；
// dev 下 autoUpdater 不可用，走旧 fetch latest 兜底返回 UpdateInfo（设置页据此显示文字）。
export async function checkUpdate(): Promise<UpdateInfo> {
  if (app.isPackaged) {
    // 打包后：触发一次 autoUpdater 检查，状态走事件推送；这里立即返回当前已知状态的文字版。
    checkForUpdatesSilently()
    return { current: app.getVersion(), latest: null, hasUpdate: false, releaseUrl: null }
  }
  return legacyCheckUpdate()
}

// dev 兜底：手写 fetch GitHub latest（autoUpdater 在 dev 无 feed 配置）。一律 resolve 不抛。
async function legacyCheckUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'Vocall-Updater' },
      signal: controller.signal,
    })
    if (res.status === 404) {
      return { current, latest: null, hasUpdate: false, releaseUrl: null, error: '尚未发布任何版本' }
    }
    if (!res.ok) {
      return { current, latest: null, hasUpdate: false, releaseUrl: null, error: `GitHub 返回 HTTP ${res.status}` }
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    const latest = (data.tag_name ?? '').replace(/^v/i, '').trim()
    const releaseUrl = data.html_url ?? `https://github.com/${OWNER}/${REPO}/releases`
    if (!latest) {
      return { current, latest: null, hasUpdate: false, releaseUrl, error: '未解析到版本号' }
    }
    return { current, latest, hasUpdate: compareVersions(latest, current) > 0, releaseUrl }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { current, latest: null, hasUpdate: false, releaseUrl: null, error: '请求超时（>15s）' }
    }
    return { current, latest: null, hasUpdate: false, releaseUrl: null, error: `检查失败：${err instanceof Error ? err.message : String(err)}` }
  } finally {
    clearTimeout(timer)
  }
}

// —— 首启更新日志（设计稿 3.3 时机②）——
// 当前版本 > last_seen_changelog_version → 返回当前版本的 releaseNotes 让渲染端弹一次。
// 取内容复用 autoUpdater 已查到的 latest releaseNotes（与「发现新版」同源，不额外发请求）；
// 取不到（离线/未查）则返回 null 静默跳过（不影响启动）。
const LAST_SEEN_KEY = 'last_seen_changelog_version'

// 启动时调用：判定该不该弹 + 返回内容。无论弹不弹都把当前版本写入 last_seen（下次不再弹）。
// 返回 null = 不弹（首装/已读过/无内容）。
export async function getPendingChangelog(): Promise<{ version: string; notes: string } | null> {
  const current = app.getVersion()
  const lastSeen = getSetting(LAST_SEEN_KEY) ?? ''
  const show = shouldShowChangelog(current, lastSeen)
  // 立即把当前版本标记为已读——即使本次弹了，下次启动也不再弹（「不反复显示」）。
  if (current !== lastSeen) setSetting(LAST_SEEN_KEY, current)
  if (!show) return null
  // 拉当前版本的 releaseNotes：autoUpdater 的 latest 即当前版本（刚更新完 latest===current）。
  try {
    if (!app.isPackaged) return null
    const result = await autoUpdater.checkForUpdates()
    const notes = normalizeReleaseNotes(result?.updateInfo?.releaseNotes)
    if (!notes) return null
    return { version: current, notes }
  } catch {
    return null // 拉不到就静默跳过
  }
}

// 渲染端确认已读后调用（双保险：getPendingChangelog 已写入，这里兼容显式标记）
export function markChangelogSeen(): void {
  setSetting(LAST_SEEN_KEY, app.getVersion())
}
