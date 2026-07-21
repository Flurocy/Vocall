import type { Expression } from './expressions'
import { listExpressions } from './expressions'
import { getSrsState, setSrsState } from './store'
import { review, type Grade, type SrsState } from './srs'

// 到期查询：遍历全部表达块，用 getSrsState(id) 取复习状态，筛 due_at <= now 中最早到期的一条。
// 注意：不要直接遍历 store 里的 srsStates 域——JSON 序列化后其键是字符串，
// 若必须遍历需 Number(key) 转回数字 id；这里改为以 expressions 数组为主遍历，天然避开该坑。
export function getDueExpression(now: number): Expression | null {
  let best: Expression | null = null
  let bestDue = Infinity
  for (const e of listExpressions()) {
    const s = getSrsState(e.id)
    if (!s) continue
    if (s.due_at <= now && s.due_at < bestDue) {
      best = e
      bestDue = s.due_at
    }
  }
  return best
}

// 评分回写：读出现状 → 纯函数 review 计算 → setSrsState 整体写回（含 due_at / last_reviewed）
// 注意：srs.ts 的 SrsState 只有 { easiness, interval, repetitions } 三字段，
// store.ts 的 SrsState 额外含 due_at / last_reviewed，故写回时必须显式补全这两个字段。
export function applyReview(exprId: number, grade: Grade, now: number): void {
  const cur = getSrsState(exprId)
  const base: SrsState = cur
    ? { easiness: cur.easiness, interval: cur.interval, repetitions: cur.repetitions }
    : { easiness: 2.5, interval: 0, repetitions: 0 }
  const next = review(base, grade)
  const dueAt = now + Math.round(next.interval * 60 * 1000) // interval 是分钟，due_at 是毫秒时间戳
  setSrsState(exprId, {
    easiness: next.easiness,
    interval: next.interval,
    repetitions: next.repetitions,
    due_at: dueAt,
    last_reviewed: now,
  })
}
