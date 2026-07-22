import type { BrowserWindow } from 'electron'
import { getDueExpression } from './scheduler'
import { getSetting } from './settings'
import { showPopup } from './popup'

export function startEngine(getPopup: () => BrowserWindow): void {
  const tick = (): void => {
    const now = Date.now()
    const due = getDueExpression(now)
    if (due) {
      showPopup(getPopup(), due)
      // 弹出后给一个兜底间隔，避免同一条连续弹
      const minGapMs = Number(getSetting('popup_interval_min')) * 60 * 1000
      setTimeout(tick, minGapMs)
      return
    }
    setTimeout(tick, 15 * 1000) // 无到期则 15s 后再查
  }
  tick()
}
