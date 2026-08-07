import { describe, it, expect, beforeEach } from 'vitest'
import {
  calcOverall,
  calcDailyTrend,
  calcMastery,
  calcStreak,
  recentEvents,
  getStatsOverview,
} from '../src/main/stats'
import { _resetStoreForTests, appendReviewEvent, bumpDailyStat, localDateKey } from '../src/main/store'
import { addVocab, updateVocab } from '../src/main/vocab'
import type { DailyStat, ReviewEvent } from '../src/main/store'
import type { VocabItem } from '../src/main/vocab'

const D = (date: string, total: number, correct: number): DailyStat => ({ date, total, correct })

describe('B1 聚合纯函数', () => {
  beforeEach(() => _resetStoreForTests())

  describe('calcOverall', () => {
    it('空数据 → total 0，accuracy null（不显示 0%）', () => {
      expect(calcOverall([])).toEqual({ total: 0, accuracy: null })
    })
    it('跨日汇总 correct/total', () => {
      const r = calcOverall([D('2026-08-06', 4, 3), D('2026-08-07', 6, 3)])
      expect(r).toEqual({ total: 10, accuracy: 60 }) // 6/10
    })
    it('四舍五入到整数', () => {
      expect(calcOverall([D('2026-08-07', 3, 1)]).accuracy).toBe(33) // 1/3=33.3→33
    })
  })

  describe('calcDailyTrend', () => {
    it('缺日补 {total:0, accuracy:null}，有数据日算正确率', () => {
      const t = calcDailyTrend([D('2026-08-06', 4, 2)], 3, '2026-08-07')
      expect(t).toEqual([
        { date: '2026-08-05', total: 0, accuracy: null },
        { date: '2026-08-06', total: 4, accuracy: 50 },
        { date: '2026-08-07', total: 0, accuracy: null },
      ])
    })
    it('跨月边界正确回推', () => {
      const t = calcDailyTrend([], 2, '2026-08-01')
      expect(t.map((p) => p.date)).toEqual(['2026-07-31', '2026-08-01'])
    })
    it('当日 0 题 → accuracy null（图表断点，非 0%）', () => {
      const t = calcDailyTrend([D('2026-08-07', 0, 0)], 1, '2026-08-07')
      expect(t[0].accuracy).toBeNull()
    })
  })

  describe('calcMastery', () => {
    const V = (status: VocabItem['status']): VocabItem =>
      ({ id: Math.random(), word: 'w', meaning: 'm', example: '', topic: null, book: null, status, source: 's', created_at: 0 }) as VocabItem
    it('按 status 计四态', () => {
      const m = calcMastery([V('new'), V('new'), V('learning'), V('review'), V('mastered'), V('mastered'), V('mastered')])
      expect(m).toEqual({ new: 2, learning: 1, review: 1, mastered: 3 })
    })
    it('空 → 全 0', () => {
      expect(calcMastery([])).toEqual({ new: 0, learning: 0, review: 0, mastered: 0 })
    })
  })

  describe('calcStreak', () => {
    it('全空 → 0', () => {
      expect(calcStreak([], '2026-08-07')).toBe(0)
    })
    it('今天有数据 → 含今天连续数', () => {
      const s = calcStreak([D('2026-08-05', 1, 1), D('2026-08-06', 1, 1), D('2026-08-07', 1, 1)], '2026-08-07')
      expect(s).toBe(3)
    })
    it('今天还没答 → 从昨天起算不断签', () => {
      const s = calcStreak([D('2026-08-06', 1, 1), D('2026-08-05', 1, 1)], '2026-08-07')
      expect(s).toBe(2)
    })
    it('中间断一天 → 只数最近连续段', () => {
      const s = calcStreak([D('2026-08-04', 1, 1), D('2026-08-06', 1, 1), D('2026-08-07', 1, 1)], '2026-08-07')
      expect(s).toBe(2) // 08-05 缺，断
    })
    it('total=0 的日不算有答题', () => {
      const s = calcStreak([D('2026-08-06', 0, 0), D('2026-08-07', 1, 1)], '2026-08-07')
      expect(s).toBe(1)
    })
  })

  describe('recentEvents', () => {
    beforeEach(() => _resetStoreForTests())
    it('新的在前，join 词名', () => {
      const a = addVocab({ word: 'apple', meaning: 'm', example: '', topic: null, source: 's' })
      const evs: ReviewEvent[] = [
        { ts: 1, vocabId: a.id, grade: 2 },
        { ts: 2, vocabId: a.id, grade: 0 },
      ]
      const r = recentEvents(evs, [a], 10)
      expect(r.map((x) => x.ts)).toEqual([2, 1]) // 新在前
      expect(r[0].word).toBe('apple')
    })
    it('词被删 → word 兜底（已删除）', () => {
      const r = recentEvents([{ ts: 1, vocabId: 999, grade: 1 }], [], 10)
      expect(r[0].word).toBe('（已删除）')
    })
    it('只取最近 n 条', () => {
      const evs: ReviewEvent[] = Array.from({ length: 10 }, (_, i) => ({ ts: i, vocabId: 1, grade: 2 as const }))
      expect(recentEvents(evs, [], 3).map((x) => x.ts)).toEqual([9, 8, 7])
    })
  })

  describe('getStatsOverview 组装', () => {
    it('端到端：种子数据 → 全量载荷', () => {
      const v = addVocab({ word: 'hello', meaning: 'm', example: '', topic: null, source: 's' })
      updateVocab(v.id, { status: 'learning' })
      const today = localDateKey(Date.now())
      bumpDailyStat(today, true)
      bumpDailyStat(today, false)
      appendReviewEvent({ ts: Date.now(), vocabId: v.id, grade: 2 })
      const o = getStatsOverview(30, 50)
      expect(o.totalAnswers).toBe(2)
      expect(o.overallAccuracy).toBe(50)
      expect(o.streakDays).toBe(1)
      expect(o.mastery.learning).toBe(1)
      expect(o.trend.length).toBe(30)
      expect(o.recent[0].word).toBe('hello')
    })
    it('空库 → 安全默认值，不崩', () => {
      const o = getStatsOverview()
      expect(o.totalAnswers).toBe(0)
      expect(o.overallAccuracy).toBeNull()
      expect(o.streakDays).toBe(0)
      expect(o.recent).toEqual([])
    })
  })
})
