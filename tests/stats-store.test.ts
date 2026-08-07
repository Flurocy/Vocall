import { describe, it, expect, beforeEach } from 'vitest'
import {
  _resetStoreForTests,
  localDateKey,
  appendReviewEvent,
  bumpDailyStat,
  getReviewEvents,
  getDailyStats,
} from '../src/main/store'

// B1 数据层：事件流 + 每日聚合的原子读写
describe('B1 stats store', () => {
  beforeEach(() => _resetStoreForTests())

  describe('localDateKey', () => {
    it('用本地时区拼 YYYY-MM-DD，月日补零', () => {
      // new Date(y, m, d) 是本地时区构造，不受 UTC 影响
      const ts = new Date(2026, 0, 5, 23, 30).getTime() // 2026-01-05 23:30 本地
      expect(localDateKey(ts)).toBe('2026-01-05')
    })
    it('深夜不归到前一天（区别于 UTC toISOString）', () => {
      const ts = new Date(2026, 7, 7, 1, 0).getTime() // 2026-08-07 01:00 本地
      expect(localDateKey(ts)).toBe('2026-08-07')
    })
  })

  describe('appendReviewEvent / getReviewEvents', () => {
    it('空库读回空数组（缺 key 兜底）', () => {
      expect(getReviewEvents()).toEqual([])
    })
    it('按追加顺序读回', () => {
      appendReviewEvent({ ts: 1000, vocabId: 1, grade: 2 })
      appendReviewEvent({ ts: 2000, vocabId: 2, grade: 0 })
      expect(getReviewEvents()).toEqual([
        { ts: 1000, vocabId: 1, grade: 2 },
        { ts: 2000, vocabId: 2, grade: 0 },
      ])
    })
    it('超上限截头保尾（留最新）', () => {
      for (let i = 0; i < 2005; i++) appendReviewEvent({ ts: i, vocabId: i, grade: 1 })
      const evs = getReviewEvents()
      expect(evs.length).toBe(2000)
      expect(evs[0].ts).toBe(5) // 最旧的 0-4 被截掉
      expect(evs[evs.length - 1].ts).toBe(2004)
    })
  })

  describe('bumpDailyStat / getDailyStats', () => {
    it('空库读回空数组', () => {
      expect(getDailyStats()).toEqual([])
    })
    it('当日首次新建条目', () => {
      bumpDailyStat('2026-08-07', true)
      expect(getDailyStats()).toEqual([{ date: '2026-08-07', total: 1, correct: 1 }])
    })
    it('当日累加 total 与 correct', () => {
      bumpDailyStat('2026-08-07', true)
      bumpDailyStat('2026-08-07', false)
      bumpDailyStat('2026-08-07', true)
      expect(getDailyStats()).toEqual([{ date: '2026-08-07', total: 3, correct: 2 }])
    })
    it('跨天分开建条目并按 date 升序', () => {
      bumpDailyStat('2026-08-07', true)
      bumpDailyStat('2026-08-08', false)
      expect(getDailyStats()).toEqual([
        { date: '2026-08-07', total: 1, correct: 1 },
        { date: '2026-08-08', total: 1, correct: 0 },
      ])
    })
    it('乱序插入（时钟回拨）后仍保持升序', () => {
      bumpDailyStat('2026-08-08', true)
      bumpDailyStat('2026-08-06', false) // 比最后一条更早 → 触发重排
      const ds = getDailyStats()
      expect(ds.map((d) => d.date)).toEqual(['2026-08-06', '2026-08-08'])
    })
  })
})
