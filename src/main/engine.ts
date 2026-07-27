import type { BrowserWindow } from 'electron'
import { getDueVocab } from './scheduler'
import { getSetting } from './settings'
import { showPopup } from './popup'
import { incrementPop } from './store'

export function startEngine(getPopup: () => BrowserWindow): void {
  const tick = (): void => {
    const due = getDueVocab()
    if (due) {
      incrementPop() // 弹一次，全局节拍 +1（调度的唯一"时钟"）
      showPopup(getPopup(), due)
      // 弹出后给一个兜底间隔，避免同一条连续弹。
      // 防御（评审 I-1）：设置页清空输入框存 ''，Number('')=0 会成热循环；
      // 用 Math.max(1, ...||8) 与 pass_count 同款兜底，保证 ≥1 分钟。
      const minGapMs = Math.max(1, Number(getSetting('popup_interval_min')) || 8) * 60 * 1000
      setTimeout(tick, minGapMs)
      return
    }
    setTimeout(tick, 15 * 1000) // 无到期则 15s 后再查
  }
  tick()
}
