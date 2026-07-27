import type { VocabItem } from './vocab'
import { listVocab, updateVocab } from './vocab'
import { getSrsState, setSrsState } from './store'
import { getSetting } from './settings'
import {
  defaultState,
  reviewLearning,
  reviewReview,
  type Grade,
  type ReviewOpts,
  type SrsState,
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
    forgotMin: Math.max(1, num('forgot_gap_min', 5)),
    fuzzyMin: Math.max(1, num('fuzzy_gap_min', 20)),
    learningSteps: listSetting('learning_step_min', [10, 60]),
    reviewSteps: listSetting('review_steps_day', [1, 3, 7, 15, 30]),
  }
}

// 到期挑选：只看 learning / review（跳过 new 未解锁词），且 due_at <= now，取最早到期的一条。
// 注意：不要直接遍历 store 里的 srsStates 域——JSON 序列化后其键是字符串，
// 若必须遍历需 Number(key) 转回数字 id；这里以 vocab 数组为主遍历，天然避开该坑。
export function getDueVocab(now: number): VocabItem | null {
  let best: VocabItem | null = null
  let bestDue = Infinity
  for (const e of listVocab()) {
    if (e.status === 'new') continue
    const s = getSrsState(e.id)
    if (!s) continue
    if (s.due_at <= now && s.due_at < bestDue) {
      best = e
      bestDue = s.due_at
    }
  }
  return best
}

// 评分路由 + 毕业 + 打回：
// - learning：纯函数算下一态；grade 2 且 repetitions 满 passN → status 升 review（毕业），并补位
// - review：grade 1/2 走阶梯；grade 0 → 打回 learning（repetitions 清零 + forgotMin）
// 注意：srs.ts 的纯函数只算 { easiness, interval, repetitions }，
// 写回时必须显式补 due_at（interval 分钟 → 毫秒时间戳）和 last_reviewed。
export function applyReview(id: number, grade: Grade, now: number): void {
  const item = listVocab().find((v) => v.id === id)
  if (!item) return
  const cur = getSrsState(id)
  const base: SrsState = cur
    ? { easiness: cur.easiness, interval: cur.interval, repetitions: cur.repetitions }
    : defaultState()
  const o = opts()
  let next: SrsState
  let newStatus = item.status
  if (item.status === 'review') {
    if (grade === 0) {
      // 复习忘了 → 打回 learning
      next = reviewLearning({ ...base, repetitions: 0 }, 0, o)
      newStatus = 'learning'
    } else {
      next = reviewReview(base, grade, o)
    }
  } else {
    // learning（new 不会被 getDueVocab 选中，走到这里按 learning 处理）
    next = reviewLearning(base, grade, o)
    if (grade === 2 && next.repetitions >= o.passN) newStatus = 'review' // 毕业
  }
  setSrsState(id, { ...next, due_at: now + Math.round(next.interval * 60000), last_reviewed: now })
  if (newStatus !== item.status) updateVocab(id, { status: newStatus })
  if (newStatus === 'review') fillLearningQueue(now) // 毕业空位 → 补新词
}

// 补位：learning 不足 learning_cap 时，从 new 按 id 升序补（词书词先入先学）。
// 新补的词 due_at=now（立即可弹）。
export function fillLearningQueue(now: number): void {
  const cap = Math.max(1, num('learning_cap', 10))
  const all = listVocab()
  const learningCount = all.filter((v) => v.status === 'learning').length
  let need = cap - learningCount
  if (need <= 0) return
  const candidates = all.filter((v) => v.status === 'new').sort((a, b) => a.id - b.id)
  for (const c of candidates) {
    if (need <= 0) break
    updateVocab(c.id, { status: 'learning' })
    const s = getSrsState(c.id)
    setSrsState(c.id, { ...(s ?? { ...defaultState(), due_at: now, last_reviewed: null }), due_at: now })
    need--
  }
}
