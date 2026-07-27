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
      // 弹出后给一个兜底间隔，避免同一条连续弹。
      // 防御（评审 I-1）：设置页清空输入框存 ''，Number('')=0 会成热循环；
      // 用 Math.max(1, ...||8) 与 pass_count 同款兜底，保证 ≥1 分钟。
      const minGapMs = Math.max(1, Number(getSetting('popup_interval_sec')) || 480) * 1000
      // 先排下个 tick，再 showPopup：确保下个 tick 的 showPopup 回调早于本弹窗
      // 的 hideTimer（同期定时节拍，按注册顺序回调），从而 clearTimeout 掉上个 hide，
      // 避免 popup_interval ≈ popup_stay 时弹窗"闪一下消失"（详见 popup.ts 注释）
      setTimeout(tick, minGapMs)
      showPopup(getPopup(), due)
      return
    }
    setTimeout(tick, 15 * 1000) // 无到期则 15s 后再查
  }
  tick()
}
