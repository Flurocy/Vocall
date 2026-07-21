import { describe, it, expect } from 'vitest'
import { defaultState, review } from '../src/main/srs'

describe('SM-2 变体', () => {
  it('忘了(0) 重置 repetitions 并给短间隔', () => {
    const s = { easiness: 2.5, interval: 100, repetitions: 5 }
    const next = review(s, 0)
    expect(next.repetitions).toBe(0)
    expect(next.interval).toBeLessThanOrEqual(10)
    expect(next.easiness).toBeLessThan(s.easiness)
  })

  it('记得(2) 增加 repetitions 并按 easiness 放大间隔', () => {
    const s = { easiness: 2.5, interval: 60, repetitions: 1 }
    const next = review(s, 2)
    expect(next.repetitions).toBe(2)
    expect(next.interval).toBeGreaterThan(60)
  })

  it('有点印象(1) 间隔小幅增长', () => {
    const s = { easiness: 2.5, interval: 60, repetitions: 1 }
    const next = review(s, 1)
    expect(next.interval).toBeGreaterThan(60)
    expect(next.interval).toBeLessThan(60 * 2)
  })

  it('easiness 不低于下限 1.3', () => {
    let s = defaultState()
    for (let i = 0; i < 20; i++) s = review(s, 0)
    expect(s.easiness).toBeGreaterThanOrEqual(1.3)
  })
})
