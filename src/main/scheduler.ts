import type { VocabItem } from './vocab'
import { listVocab, updateVocab } from './vocab'
import { getSrsState, setSrsState, getPopCount, setPopCount } from './store'
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

// 到期挑选（弹窗节拍队列）：只看 learning / review（跳过 new 未解锁词 和 mastered 已掌握），
// 且 duePop <= 当前 popCount，取 duePop 最小（最该见）的一条。
// 注意：不要直接遍历 store 的 srsStates 域——其键是字符串；以 vocab 数组为主遍历避开。
export function getDueVocab(): VocabItem | null {
  const now = getPopCount()
  let best: VocabItem | null = null
  let bestDue = Infinity
  for (const e of listVocab()) {
    if (e.status === 'new' || e.status === 'mastered') continue
    const s = getSrsState(e.id)
    if (!s) continue
    if (s.duePop <= now && s.duePop < bestDue) {
      best = e
      bestDue = s.duePop
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
  let nextDue = Infinity
  for (const e of listVocab()) {
    if (e.status === 'new' || e.status === 'mastered') continue
    const s = getSrsState(e.id)
    if (!s) continue
    if (s.duePop < nextDue) nextDue = s.duePop
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
export function applyReview(id: number, grade: Grade): void {
  const item = listVocab().find((v) => v.id === id)
  if (!item) return
  const cur = getSrsState(id)
  const base = cur
    ? { easiness: cur.easiness, interval: 0, repetitions: cur.repetitions }
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
      const curInterval = cur ? Math.max(0, cur.duePop - now) : 0
      next = reviewReview({ ...base, interval: curInterval }, grade, o)
      // grade2 推进到的间隔 >= 掌握档（倒数第二档）→ 标 mastered（背完）
      if (grade === 2 && next.interval >= masterStep()) newStatus = 'mastered'
    }
  } else {
    // learning（new 不会被 getDueVocab 选中，走到这里按 learning 处理）
    next = reviewLearning(base, grade, o)
    if (grade === 2 && next.repetitions >= o.passN) newStatus = 'review' // 毕业
  }
  // 忘词计数：grade 0（两条路径殊途同归到这里）累计 +1；非 0 原样保留。从旧 cur 读，无则 0。
  const forgot = (cur?.forgotCount ?? 0) + (grade === 0 ? 1 : 0)
  const newDue = now + next.interval
  setSrsState(id, { easiness: next.easiness, repetitions: next.repetitions, duePop: newDue, forgotCount: forgot })
  if (newStatus !== item.status) updateVocab(id, { status: newStatus })
  logSchedule(
    `review | 「${item.word}」grade=${grade} | duePop ${now}→${newDue}（+${next.interval}）` +
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
export function fillLearningQueue(): void {
  const cap = Math.max(1, num('learning_cap', 10))
  const all = listVocab()
  const learningCount = all.filter((v) => v.status === 'learning').length
  let need = cap - learningCount
  if (need <= 0) return
  const now = getPopCount()
  const candidates = all.filter((v) => v.status === 'new').sort((a, b) => a.id - b.id)
  for (const c of candidates) {
    if (need <= 0) break
    updateVocab(c.id, { status: 'learning' })
    setSrsState(c.id, { easiness: 2.5, repetitions: 0, duePop: now, forgotCount: 0 })
    need--
  }
}
