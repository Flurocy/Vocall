import type { VocabItem } from './vocab'
import { listVocab, updateVocab } from './vocab'
import { getSrsState, setSrsState, getPopCount, setPopCount, appendReviewEvent, bumpDailyStat, localDateKey, type DirectionState } from './store'
import { logSchedule } from './logger'
import { getSetting } from './settings'
import {
  defaultState,
  reviewLearning,
  reviewReview,
  type Grade,
  type ReviewOpts,
} from './srs'

// —— 设置读取辅助：一律带兜底，防设置页存空串/非法值 ——
function num(key: string, def: number): number {
  return Math.max(0, Number(getSetting(key)) || def)
}
function listSetting(key: string, def: number[]): number[] {
  const raw = getSetting(key)
  if (!raw) return def
  const arr = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0)
  return arr.length ? arr : def
}
function opts(): ReviewOpts {
  return {
    passN: Math.max(1, num('pass_count', 3)),
    forgotPops: Math.max(1, num('forgot_gap_pops', 3)),
    fuzzyPops: Math.max(1, num('fuzzy_gap_pops', 8)),
    learningSteps: listSetting('learning_step_pops', [1, 2]),
    reviewSteps: listSetting('review_steps_pops', [50, 150, 350, 750, 1500]),
  }
}

// 掌握档：reviewSteps 倒数第二档（5 档时 = 750）。review 内 interval >= masterStep → 触发 mastered。
function masterStep(): number {
  const steps = opts().reviewSteps
  return steps.length >= 2 ? steps[steps.length - 2] : steps[0]
}

// —— 反转回忆模式（设计稿 v1.6.1 §3.3）：方向与有效到期 ——
export type PopupDirection = 'recognition' | 'recall'

function recallOn(): boolean {
  return getSetting('recall_mode_enabled') === 'true'
}

// 英译中占比 0-100。注意 0/100 是合法值：解析用 Number+isNaN，不能用 || 兜底（'0' 会被吃掉）。
function recallRatio(): number {
  const n = Number(getSetting('recall_ratio'))
  return Number.isNaN(n) ? 70 : Math.min(100, Math.max(0, n))
}

// 有效到期：回忆模式开 = min(再认顶层 duePop, recall?.duePop ?? ∞)；关 = 顶层 duePop（现状逐字节一致）。
function effectiveDue(s: { duePop: number; recall?: DirectionState }, on: boolean): number {
  return on ? Math.min(s.duePop, s.recall?.duePop ?? Infinity) : s.duePop
}

// 弹窗方向裁决（组装载荷时由 popup.showPopup 调用）：
// - 回忆模式关 → 恒 recognition（不动任何状态）
// - recall 未初始化 → 本次 recognition + 懒初始化（duePop=当前 popCount，下次弹窗起回忆方向可到期）
// - recall 已存在 → 按 recall_ratio 加权随机
export function pickPopupDirection(id: number, rng: () => number = Math.random): PopupDirection {
  if (!recallOn()) return 'recognition'
  const cur = getSrsState(id)
  if (!cur) return 'recognition'
  if (!cur.recall) {
    setSrsState(id, {
      ...cur,
      recall: { easiness: 2.5, repetitions: 0, duePop: getPopCount(), forgotCount: 0 },
    })
    return 'recognition'
  }
  return rng() * 100 < recallRatio() ? 'recognition' : 'recall'
}

// 到期挑选（弹窗节拍队列）：只看 learning / review（跳过 new 未解锁词 和 mastered 已掌握），
// 且 有效到期 <= 当前 popCount，取最小（最该见）的一条。
// 有效到期 = effectiveDue（回忆模式开时含 recall 方向）；关闭时=顶层 duePop，与现状逐字节一致。
// 注意：不要直接遍历 store 的 srsStates 域——其键是字符串；以 vocab 数组为主遍历避开。
export function getDueVocab(): VocabItem | null {
  const now = getPopCount()
  const on = recallOn()
  let best: VocabItem | null = null
  let bestDue = Infinity
  for (const e of listVocab()) {
    if (e.status === 'new' || e.status === 'mastered') continue
    const s = getSrsState(e.id)
    if (!s) continue
    const due = effectiveDue(s, on)
    if (due <= now && due < bestDue) {
      best = e
      bestDue = due
    }
  }
  return best
}

// 时钟快进（修"再也不弹词"死锁）：
// 死锁成因——popCount 只在"弹词"那一刻 +1（engine.incrementPop），而弹词又要求 duePop <= popCount，
// 二者互为前提。一旦所有 learning/review 词的 duePop 都 > popCount（学完一本书全毕业 / 单词小库
// 答完题 duePop=popCount+interval），getDueVocab 恒为 null → 不弹 → popCount 停摆 → 永远都在未来 → 再不弹。
// 解法：引擎空转时调本函数，把 popCount 直接追到最近的到期点，让最该见的词立即到期。
// 返回 { advanced, nextDue }：是否发生了快进、追到的目标值（无学习/复习词时 nextDue=null）。
export function advancePopToNextDue(): { advanced: boolean; nextDue: number | null } {
  const now = getPopCount()
  const on = recallOn()
  let nextDue = Infinity
  for (const e of listVocab()) {
    if (e.status === 'new' || e.status === 'mastered') continue
    const s = getSrsState(e.id)
    if (!s) continue
    const due = effectiveDue(s, on) // 回忆模式开：recall 到期点更早时快进目标取它
    if (due < nextDue) nextDue = due
  }
  if (nextDue === Infinity) return { advanced: false, nextDue: null } // 队列空（无学习/复习词）
  if (nextDue > now) {
    setPopCount(nextDue) // 时钟落后 → 追到最近到期点
    return { advanced: true, nextDue }
  }
  return { advanced: false, nextDue } // 时钟没落后（已有到期词），不动
}

// 评分路由 + 毕业 + 打回：
// - learning：纯函数算下一态；grade 2 且 repetitions 满 passN → status 升 review（毕业），并补位
// - review：grade 1/2 走阶梯；grade 0 → 打回 learning（repetitions 清零 + forgotPops）
// 写回时把纯函数产出的相对 interval（弹窗次数）换算成绝对 duePop = 当前 popCount + interval。
// direction（反转回忆）：'recognition'（默认，读写顶层字段，旧调用零变化）/ 'recall'（读写嵌套 recall）。
// 两方向共享 status 生命周期（毕业/打回/mastered 一套逻辑），进度各自独立。
export function applyReview(id: number, grade: Grade, direction: PopupDirection = 'recognition'): void {
  const item = listVocab().find((v) => v.id === id)
  if (!item) return
  const cur = getSrsState(id)
  // 当前方向的状态：recall 取嵌套子状态（未初始化防御当无）；recognition 取顶层字段
  const dirCur: DirectionState | undefined =
    direction === 'recall'
      ? cur?.recall
      : cur
        ? { easiness: cur.easiness, repetitions: cur.repetitions, duePop: cur.duePop, forgotCount: cur.forgotCount }
        : undefined
  const base = dirCur
    ? { easiness: dirCur.easiness, interval: 0, repetitions: dirCur.repetitions }
    : defaultState()
  const o = opts()
  const now = getPopCount()
  let next
  let newStatus = item.status
  if (item.status === 'review') {
    if (grade === 0) {
      // 复习忘了 → 打回 learning
      next = reviewLearning({ ...base, repetitions: 0 }, 0, o)
      newStatus = 'learning'
    } else {
      // review 阶梯：需要当前间隔来推进。当前间隔 = duePop - popCount（剩余弹窗数），负则当 0
      const curInterval = dirCur ? Math.max(0, dirCur.duePop - now) : 0
      next = reviewReview({ ...base, interval: curInterval }, grade, o)
      // grade2 推进到的间隔 >= 掌握档（倒数第二档）→ 标 mastered（背完）
      if (grade === 2 && next.interval >= masterStep()) newStatus = 'mastered'
    }
  } else {
    // learning（new 不会被 getDueVocab 选中，走到这里按 learning 处理）
    next = reviewLearning(base, grade, o)
    if (grade === 2 && next.repetitions >= o.passN) newStatus = 'review' // 毕业
  }
  // 忘词计数：grade 0 累计 +1（按方向各自累计）；非 0 原样保留。
  const forgot = (dirCur?.forgotCount ?? 0) + (grade === 0 ? 1 : 0)
  const newDue = now + next.interval
  const dirNext: DirectionState = {
    easiness: next.easiness,
    repetitions: next.repetitions,
    duePop: newDue,
    forgotCount: forgot,
  }
  if (direction === 'recall') {
    // 写 recall 子状态，顶层（recognition）字段原样保留；无 cur 时防御性补默认顶层
    setSrsState(id, {
      easiness: cur?.easiness ?? 2.5,
      repetitions: cur?.repetitions ?? 0,
      duePop: cur?.duePop ?? now,
      forgotCount: cur?.forgotCount ?? 0,
      recall: dirNext,
    })
  } else {
    // 写顶层，recall 子状态原样保留（旧数据无 recall 则不带）
    setSrsState(id, cur?.recall ? { ...dirNext, recall: cur.recall } : dirNext)
  }
  // B1 统计：评分落库后记录事件流 + 当日聚合（grade 0/1/2、learning/review 两路都经此）。
  // correct 仅认 grade 2。上方 early-return（id 不存在）在到达这里之前已返回，天然不记。
  const ts = Date.now()
  appendReviewEvent({ ts, vocabId: id, grade, direction })
  bumpDailyStat(localDateKey(ts), grade === 2)
  if (newStatus !== item.status) updateVocab(id, { status: newStatus })
  logSchedule(
    `review | 「${item.word}」${direction === 'recall' ? '回忆' : '再认'} grade=${grade} | duePop ${now}→${newDue}（+${next.interval}）` +
    (newStatus !== item.status ? ` | ${item.status}→${newStatus}` : ''),
  )
  // 毕业空位 → 补新词；mastered 也腾空位（跟毕业一样补位）
  if (newStatus === 'review' || newStatus === 'mastered') fillLearningQueue()
}

// 手动标"已掌握"：用户在 PopupCard/ExpressionsView 主动点。仅改 status；SRS 状态保持不变。
// 同样触发 fillLearningQueue——被标的若是 learning 词会腾槽，不补会让 learning 队列静默缩水
// （cap 内已满则 no-op，幂等无害）。
export function masterVocab(id: number): void {
  updateVocab(id, { status: 'mastered' })
  fillLearningQueue()
}

// 复活重背：mastered 词回到 learning 队列立即可弹（duePop=当前 popCount，reps 清零，easiness 重置 2.5）。
// 不受 learning_cap 限制——用户主动重背应立即进队列。
export function reviveVocab(id: number): void {
  updateVocab(id, { status: 'learning' })
  // forgotCount 保留旧值：忘词历史只增不减，复活重背不清零
  setSrsState(id, { easiness: 2.5, repetitions: 0, duePop: getPopCount(), forgotCount: getSrsState(id)?.forgotCount ?? 0 })
}

// 补位：learning 不足 learning_cap 时，从 new 按 id 升序补（词书词先入先学）。
// 新补的词 duePop = 当前 popCount（立即可弹）。
// 回忆模式开时：recall 方向一起初始化（duePop 同顶层——设计稿 §3.3：两方向共享生命周期）。
export function fillLearningQueue(): void {
  const cap = Math.max(1, num('learning_cap', 10))
  const all = listVocab()
  const learningCount = all.filter((v) => v.status === 'learning').length
  let need = cap - learningCount
  if (need <= 0) return
  const now = getPopCount()
  const on = recallOn()
  const candidates = all.filter((v) => v.status === 'new').sort((a, b) => a.id - b.id)
  for (const c of candidates) {
    if (need <= 0) break
    updateVocab(c.id, { status: 'learning' })
    const init: Parameters<typeof setSrsState>[1] = { easiness: 2.5, repetitions: 0, duePop: now, forgotCount: 0 }
    if (on) init.recall = { easiness: 2.5, repetitions: 0, duePop: now, forgotCount: 0 }
    setSrsState(c.id, init)
    need--
  }
}
