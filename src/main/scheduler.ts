import type { VocabItem } from './vocab'
import { listVocab } from './vocab'
import { getSrsState, setSrsState } from './store'
import { getSetting } from './settings'
import { review, type Grade, type SrsState } from './srs'

// 到期查询：遍历全部生词，用 getSrsState(id) 取复习状态，筛 due_at <= now 中最早到期的一条。
// 注意：不要直接遍历 store 里的 srsStates 域——JSON 序列化后其键是字符串，
// 若必须遍历需 Number(key) 转回数字 id；这里改为以 vocab 数组为主遍历，天然避开该坑。
export function getDueVocab(now: number): VocabItem | null {
  let best: VocabItem | null = null
  let bestDue = Infinity
  for (const e of listVocab()) {
    const s = getSrsState(e.id)
    if (!s) continue
    if (s.due_at <= now && s.due_at < bestDue) {
      best = e
      bestDue = s.due_at
    }
  }
  return best
}

// 过关所需连续答对次数：从设置读 pass_count，NaN/0 兜底 3
function passN(): number {
  return Number(getSetting('pass_count')) || 3
}

// 评分回写：读出现状 → 纯函数 review 计算 → setSrsState 整体写回（含 due_at / last_reviewed）
// 注意：srs.ts 的 SrsState 只有 { easiness, interval, repetitions } 三字段，
// store.ts 的 SrsState 额外含 due_at / last_reviewed，故写回时必须显式补全这两个字段。
export function applyReview(exprId: number, grade: Grade, now: number): void {
  const cur = getSrsState(exprId)
  const base: SrsState = cur
    ? { easiness: cur.easiness, interval: cur.interval, repetitions: cur.repetitions }
    : { easiness: 2.5, interval: 0, repetitions: 0 }
  const next = review(base, grade, passN())
  const dueAt = now + Math.round(next.interval * 60 * 1000) // interval 是分钟，due_at 是毫秒时间戳
  setSrsState(exprId, {
    easiness: next.easiness,
    interval: next.interval,
    repetitions: next.repetitions,
    due_at: dueAt,
    last_reviewed: now,
  })
}
