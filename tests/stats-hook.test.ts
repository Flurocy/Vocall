import { describe, it, expect, beforeEach } from 'vitest'
import { addVocab, updateVocab } from '../src/main/vocab'
import { applyReview } from '../src/main/scheduler'
import {
  setSrsState,
  _resetStoreForTests,
  getReviewEvents,
  getDailyStats,
  localDateKey,
} from '../src/main/store'

// B1 评分钩子：applyReview 每次评分应记录事件流 + 当日聚合
function make(status: 'new' | 'learning' | 'review' | 'mastered', duePop = 0): ReturnType<typeof addVocab> {
  const v = addVocab({ word: `w${Math.random()}`, meaning: 'm', example: 'e', topic: null, source: 's' })
  updateVocab(v.id, { status })
  setSrsState(v.id, { easiness: 2.5, repetitions: 0, duePop })
  return v
}

describe('B1 评分记录钩子', () => {
  beforeEach(() => _resetStoreForTests())

  it('learning 各 grade 都记录事件流', () => {
    const v = make('learning', 0)
    applyReview(v.id, 0)
    applyReview(v.id, 1)
    applyReview(v.id, 2)
    const evs = getReviewEvents()
    expect(evs.length).toBe(3)
    expect(evs.map((e) => e.grade)).toEqual([0, 1, 2])
    expect(evs.every((e) => e.vocabId === v.id)).toBe(true)
  })

  it('当日聚合：total 全记，correct 仅 grade 2', () => {
    const v = make('learning', 0)
    applyReview(v.id, 2) // 对
    applyReview(v.id, 1) // 模糊，不算对
    applyReview(v.id, 0) // 忘，不算对
    const today = localDateKey(Date.now())
    expect(getDailyStats()).toEqual([{ date: today, total: 3, correct: 1 }])
  })

  it('review 态 grade 0 打回路径也记录', () => {
    const v = make('review', 0)
    applyReview(v.id, 0)
    expect(getReviewEvents().length).toBe(1)
    expect(getDailyStats()[0].total).toBe(1)
    expect(getDailyStats()[0].correct).toBe(0)
  })

  it('不存在的 id 不记录（early-return 在钩子之前）', () => {
    applyReview(99999, 2)
    expect(getReviewEvents()).toEqual([])
    expect(getDailyStats()).toEqual([])
  })

  it('多个词同日评分累加到同一日条目', () => {
    const a = make('learning', 0)
    const b = make('learning', 0)
    applyReview(a.id, 2)
    applyReview(b.id, 2)
    const today = localDateKey(Date.now())
    expect(getDailyStats()).toEqual([{ date: today, total: 2, correct: 2 }])
  })
})
