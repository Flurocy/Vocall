import type { BrowserWindow } from 'electron'
import { getDueVocab, advancePopToNextDue } from './scheduler'
import { getSetting } from './settings'
import { showPopup } from './popup'
import { incrementPop, getPopCount } from './store'
import { logSchedule } from './logger'

// —— 引擎模块级状态 ——
// tick 递归排程用的 getPopup 闭包、当前挂起的定时器句柄、挂起类型。
// 句柄与类型必须模块级：设置层改 popup_interval_sec 时要能取消旧计时、按新间隔重排（rescheduleInterval）。
let getPopupFn: (() => BrowserWindow) | null = null
let timer: ReturnType<typeof setTimeout> | null = null
// 挂起计时类型：'pop'=弹出间隔（受 popup_interval_sec 控制，重排只动它）；
// 'idle'=队列真空 15s 空转重查 / 异常 15s 重试（与间隔设置无关，不被重排）。
let pendingKind: 'pop' | 'idle' | null = null

// 弹出间隔（ms）。防御（评审 I-1）：设置页清空输入框存 ''，Number('')=0 会成热循环；
// 用 Math.max(1, ...||480) 与 pass_count 同款兜底，保证 ≥1 秒。
function gapMs(): number {
  return Math.max(1, Number(getSetting('popup_interval_sec')) || 480) * 1000
}

// 排下一次 tick：先清掉可能挂起的旧计时（正常链路同一时刻只有一个，重排/防御场景可能重叠），
// 记下类型供 rescheduleInterval 判断是否该动。
function armTimer(ms: number, kind: 'pop' | 'idle'): void {
  if (timer) clearTimeout(timer)
  pendingKind = kind
  timer = setTimeout(tick, ms)
}

function tick(): void {
  const getPopup = getPopupFn
  if (!getPopup) return
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
      // 先排下个 tick，再 showPopup：确保下个 tick 的 showPopup 回调早于本弹窗
      // 的 hideTimer（同期定时节拍，按注册顺序回调），从而 clearTimeout 掉上个 hide，
      // 避免 popup_interval ≈ popup_stay 时弹窗"闪一下消失"（详见 popup.ts 注释）
      const minGapMs = gapMs()
      armTimer(minGapMs, 'pop')
      logSchedule(`tick | popCount=${getPopCount()} | 弹出「${due.word}」 | ${Math.round(minGapMs / 1000)}s 后下次`)
      showPopup(getPopup(), due)
      return
    }
    logSchedule(`tick | popCount=${getPopCount()} | 无到期（队列真空）| 15s 后重查`)
    armTimer(15 * 1000, 'idle') // 队列真空则 15s 后再查
  } catch (err) {
    // 兜底：任何异常（如 store 写盘失败）都不让引擎静默死亡——记日志并 15s 后重试，保住调度链。
    console.error('[engine] tick 异常，15s 后重试：', err)
    logSchedule(`tick | 异常：${err instanceof Error ? err.message : String(err)} | 15s 后重试`)
    armTimer(15 * 1000, 'idle')
  }
}

export function startEngine(getPopup: () => BrowserWindow): void {
  getPopupFn = getPopup
  tick()
}

// 改 popup_interval_sec 后由设置层调用（ipc settings:set 分发）：
// 当前挂起的若是"弹出间隔"计时，取消它、从当下起按新间隔重排——立即生效，不等旧周期到期。
// 注意只重排不立即弹词：下个 tick 到点仍走正常"查到期→弹"流程。
// 挂起的是空转/异常重查（idle）时不动——它与间隔设置无关，15s 节奏保持。
export function rescheduleInterval(): void {
  if (!getPopupFn || pendingKind !== 'pop') return
  const minGapMs = gapMs()
  logSchedule(`reschedule | 间隔变更 → 重排为 ${Math.round(minGapMs / 1000)}s 后下次`)
  armTimer(minGapMs, 'pop')
}

// 测试专用：清挂起计时与模块状态，防跨用例泄漏（引擎是单例模块态）。
export function _resetEngineForTests(): void {
  if (timer) clearTimeout(timer)
  timer = null
  pendingKind = null
  getPopupFn = null
}
