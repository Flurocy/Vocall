import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests } from '../src/main/store'
import { addExpression } from '../src/main/expressions'
import { getDueExpression, applyReview } from '../src/main/scheduler'

describe('调度器', () => {
  beforeEach(() => {
    _resetStoreForTests() // 内存态重置，避免测试间互相污染
  })

  it('到期则返回该表达块', () => {
    const expr = addExpression({
      plain: 'p', advanced: 'a', example: 'e', topic: null, source: '内置',
    })
    const due = getDueExpression(Date.now())
    expect(due).not.toBeNull()
    expect(due!.id).toBe(expr.id)
  })

  it('评分"记得"后短时间内不再到期', () => {
    const expr = addExpression({
      plain: 'p', advanced: 'a', example: 'e', topic: null, source: '内置',
    })
    applyReview(expr.id, 2, Date.now())
    expect(getDueExpression(Date.now())).toBeNull()
  })

  it('评分"忘了"后很快再次到期', () => {
    const expr = addExpression({
      plain: 'p', advanced: 'a', example: 'e', topic: null, source: '内置',
    })
    applyReview(expr.id, 2, Date.now())
    applyReview(expr.id, 0, Date.now())
    // 10 分钟内到期 → 用 11 分钟后的时间戳判定
    expect(getDueExpression(Date.now() + 11 * 60 * 1000)).not.toBeNull()
  })
})
