import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests, getSrsState } from '../src/main/store'
import { addVocab } from '../src/main/vocab'
import { getDueVocab, applyReview } from '../src/main/scheduler'
import { setSetting } from '../src/main/settings'

describe('调度器', () => {
  beforeEach(() => {
    _resetStoreForTests() // 内存态重置，避免测试间互相污染
  })

  it('到期则返回该生词', () => {
    const expr = addVocab({
      word: 'p', meaning: 'a', example: 'e', topic: null, source: '内置',
    })
    const due = getDueVocab(Date.now())
    expect(due).not.toBeNull()
    expect(due!.id).toBe(expr.id)
  })

  it('评分"认识"后短时间内不再到期', () => {
    const expr = addVocab({
      word: 'p', meaning: 'a', example: 'e', topic: null, source: '内置',
    })
    applyReview(expr.id, 2, Date.now())
    expect(getDueVocab(Date.now())).toBeNull()
  })

  it('评分"忘了"后很快再次到期', () => {
    const expr = addVocab({
      word: 'p', meaning: 'a', example: 'e', topic: null, source: '内置',
    })
    applyReview(expr.id, 2, Date.now())
    applyReview(expr.id, 0, Date.now())
    // 10 分钟内到期 → 用 11 分钟后的时间戳判定
    expect(getDueVocab(Date.now() + 11 * 60 * 1000)).not.toBeNull()
  })

  it('默认 pass_count=3：连续 3 次认识后 due_at ≈ now + 30 天', () => {
    const expr = addVocab({
      word: 'p', meaning: 'a', example: 'e', topic: null, source: '内置',
    })
    const now = Date.now()
    applyReview(expr.id, 2, now)
    applyReview(expr.id, 2, now)
    applyReview(expr.id, 2, now)
    const s = getSrsState(expr.id)!
    expect(s.repetitions).toBe(3)
    expect(s.due_at).toBe(now + 43200 * 60 * 1000)
  })

  it('设置 pass_count=2 时两次认识后 due_at ≈ now + 30 天', () => {
    setSetting('pass_count', '2')
    const expr = addVocab({
      word: 'p', meaning: 'a', example: 'e', topic: null, source: '内置',
    })
    const now = Date.now()
    applyReview(expr.id, 2, now)
    applyReview(expr.id, 2, now)
    const s = getSrsState(expr.id)!
    expect(s.repetitions).toBe(2)
    expect(s.due_at).toBe(now + 43200 * 60 * 1000)
  })

  it('pass_count 非法值兜底为 3', () => {
    setSetting('pass_count', 'abc')
    const expr = addVocab({
      word: 'p', meaning: 'a', example: 'e', topic: null, source: '内置',
    })
    const now = Date.now()
    applyReview(expr.id, 2, now)
    applyReview(expr.id, 2, now)
    // 兜底 3：两次还没到 30 天档
    expect(getSrsState(expr.id)!.interval).toBe(360)
    applyReview(expr.id, 2, now)
    expect(getSrsState(expr.id)!.due_at).toBe(now + 43200 * 60 * 1000)
  })
})
