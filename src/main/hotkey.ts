import { app, globalShortcut } from 'electron'
import type { BrowserWindow } from 'electron'
import { getDueVocab } from './scheduler'
import { listVocab } from './vocab'
import type { VocabItem } from './vocab'
import { showPopup } from './popup'
import { incrementPop } from './store'
import { getSetting } from './settings'

// 主动唤出选词（纯逻辑，无 electron 依赖，便于单测）：
// 1) 到期词优先——复用 getDueVocab（与 engine.tick 同一队列，duePop 最小者先弹）；
// 2) 无到期 → 从 listVocab 过滤 learning+review 随机抽一个（跳过 new 未解锁 / mastered 已背完）；
// 3) 候选为空 → null（调用方静默不弹）。
export function pickPopupWord(): VocabItem | null {
  const due = getDueVocab()
  if (due) return due
  const pool = listVocab().filter((v) => v.status === 'learning' || v.status === 'review')
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// 主动唤出：选词 → incrementPop（与定时弹窗统一节拍时钟）→ showPopup。
// 与 engine.tick 有词分支一致，但不排 setTimeout——hotkey 不接管定时循环。
// getPopup 接受 null（popupWin 可能未建）：选到词但弹窗没了就不弹，不强假设非空。
export function popupNow(getPopup: () => BrowserWindow | null): void {
  const word = pickPopupWord()
  if (!word) return
  const win = getPopup()
  if (!win) return
  incrementPop()
  showPopup(win, word)
}

// 读 popup_hotkey 注册全局快捷键。空串（设置里 Esc 绑定）= 禁用，不注册。
// 注册失败（返回 false，多为系统冲突）console.warn 不抛——快捷键失效不阻断 App。
export function registerHotkey(getPopup: () => BrowserWindow | null): void {
  const acc = getSetting('popup_hotkey')
  if (!acc) return
  const ok = globalShortcut.register(acc, () => popupNow(getPopup))
  if (!ok) console.warn(`[hotkey] 注册失败："${acc}" 可能与系统快捷键冲突`)
}

// 设置改后重绑：先全部注销再按新值注册（旧绑定清掉，避免残留）。
export function reregisterHotkey(getPopup: () => BrowserWindow | null): void {
  globalShortcut.unregisterAll()
  registerHotkey(getPopup)
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
}

// 退出前注销所有快捷键：否则系统级残留会占用组合键直到重启。
// will-quit（非 before-quit）按计划要求。
app.on('will-quit', () => globalShortcut.unregisterAll())
