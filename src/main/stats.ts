// B1 学习统计：聚合纯函数。输入是 store 读出的数组，输出给 UI 的统计结果。
// 全部纯函数（可测），store 读取收敛在底部 getStatsOverview 薄组装层。
import type { ReviewEvent, DailyStat } from './store'
import { getReviewEvents, getDailyStats, localDateKey } from './store'
import { listVocab } from './vocab'
import type { VocabItem } from './vocab'

// 单日趋势点：当日正确率；当日 0 题时 accuracy=null（图表断点，不画 0% 误导）
export interface TrendPoint {
  date: string // 本地 YYYY-MM-DD
  total: number
  accuracy: number | null // 0-100；null=当日无答题
}

// 掌握度分布：四态各多少词
export interface MasteryCount {
  new: number
  learning: number
  review: number
  mastered: number
}

// 统计页一次性载荷
export interface StatsOverview {
  totalAnswers: number // 累计答题数
  overallAccuracy: number | null // 累计正确率 0-100；一次没答过=null
  streakDays: number // 连续答题天数（含今天；今天没答则从昨天起算）
  mastery: MasteryCount
  trend: TrendPoint[] // 近 N 天每日正确率
  recent: (ReviewEvent & { word: string })[] // 近 N 条事件 join 词名
}

// 整体正确率：Σcorrect/Σtotal。一次没答过返回 null（UI 显示"—"而非 0%）。
export function calcOverall(daily: DailyStat[]): { total: number; accuracy: number | null } {
  const total = daily.reduce((s, d) => s + d.total, 0)
  const correct = daily.reduce((s, d) => s + d.correct, 0)
  return { total, accuracy: total === 0 ? null : Math.round((correct / total) * 100) }
}

// 近 N 天每日正确率趋势。today 显式传参（防测试 flake + 时区可控）。
// 缺日补 {total:0, accuracy:null}；有数据的日 accuracy=round(correct/total*100)。
export function calcDailyTrend(daily: DailyStat[], days: number, today: string): TrendPoint[] {
  const byDate = new Map(daily.map((d) => [d.date, d]))
  const out: TrendPoint[] = []
  // 从 today 往前数 days 天（含今天）。用本地 Date 逐日回推，避免手算月份天数。
  const [y, m, d] = today.split('-').map(Number)
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(y, m - 1, d - i) // 本地时区构造，自动处理跨月/跨年
    const key = localDateKey(dt.getTime())
    const rec = byDate.get(key)
    out.push({
      date: key,
      total: rec?.total ?? 0,
      accuracy: rec && rec.total > 0 ? Math.round((rec.correct / rec.total) * 100) : null,
    })
  }
  return out
}

// 掌握度分布：按 status 计四态。trash 是独立数组，vocab 列表天然不含回收站词。
export function calcMastery(vocab: VocabItem[]): MasteryCount {
  const out: MasteryCount = { new: 0, learning: 0, review: 0, mastered: 0 }
  for (const v of vocab) out[v.status]++
  return out
}

// 连续答题天数：从今天（或昨天，若今天还没答）往前数连续的"有答题"日。
// today 显式传参。全空返回 0。
export function calcStreak(daily: DailyStat[], today: string): number {
  const dates = new Set(daily.filter((d) => d.total > 0).map((d) => d.date))
  if (dates.size === 0) return 0
  const [y, m, d] = today.split('-').map(Number)
  // 起始点：今天有数据则从今天起，否则从昨天起（今天还没开始学不算断签）
  let offset = dates.has(today) ? 0 : 1
  let streak = 0
  for (; ; offset++) {
    const dt = new Date(y, m - 1, d - offset)
    if (!dates.has(localDateKey(dt.getTime()))) break
    streak++
  }
  return streak
}

// 近 N 条事件（新的在前），join 词名。词被删了（回收站/彻底删）word 兜底 '（已删除）'。
export function recentEvents(events: ReviewEvent[], vocab: VocabItem[], n: number): (ReviewEvent & { word: string })[] {
  const wordById = new Map(vocab.map((v) => [v.id, v.word]))
  return events
    .slice(-n)
    .reverse()
    .map((e) => ({ ...e, word: wordById.get(e.vocabId) ?? '（已删除）' }))
}

// 薄组装：读 store → 跑聚合 → 出统计页全量载荷。trendDays/recentN 可调。
export function getStatsOverview(trendDays = 30, recentN = 50): StatsOverview {
  const daily = getDailyStats()
  const events = getReviewEvents()
  const vocab = listVocab()
  const today = localDateKey(Date.now())
  const { total, accuracy } = calcOverall(daily)
  return {
    totalAnswers: total,
    overallAccuracy: accuracy,
    streakDays: calcStreak(daily, today),
    mastery: calcMastery(vocab),
    trend: calcDailyTrend(daily, trendDays, today),
    recent: recentEvents(events, vocab, recentN),
  }
}
