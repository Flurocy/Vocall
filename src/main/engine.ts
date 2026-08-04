import type { BrowserWindow } from 'electron'
import { getDueVocab, advancePopToNextDue } from './scheduler'
import { getSetting } from './settings'
import { showPopup } from './popup'
import { incrementPop, getPopCount } from './store'
import { logSchedule } from './logger'

export function startEngine(getPopup: () => BrowserWindow): void {
  const tick = (): void => {
    try {
      let due = getDueVocab()
      if (!due) {
        // 无到期词：先追时钟——可能所有词 duePop 都在未来而 popCount 停摆（死锁），
        // 快进到最近到期点后重查，让最该见的词立即到期。队列真空（无学习/复习词）才空转。
        const { advanced, nextDue } = advancePopToNextDue()
        if (advanced) {
          logSchedule(`tick | 时钟快进 → popCount=${nextDue}`)
          due = getDueVocab()
        }
      }
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
        logSchedule(`tick | popCount=${getPopCount()} | 弹出「${due.word}」 | ${Math.round(minGapMs / 1000)}s 后下次`)
        showPopup(getPopup(), due)
        return
      }
      logSchedule(`tick | popCount=${getPopCount()} | 无到期（队列真空）| 15s 后重查`)
      setTimeout(tick, 15 * 1000) // 队列真空则 15s 后再查
    } catch (err) {
      // 兜底：任何异常（如 store 写盘失败）都不让引擎静默死亡——记日志并 15s 后重试，保住调度链。
      console.error('[engine] tick 异常，15s 后重试：', err)
      logSchedule(`tick | 异常：${err instanceof Error ? err.message : String(err)} | 15s 后重试`)
      setTimeout(tick, 15 * 1000)
    }
  }
  tick()
}
