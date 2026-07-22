import { describe, it, expect } from 'vitest'
import { defaultState, review } from '../src/main/srs'

describe('SM-2 变体（连续答对 N 次过关）', () => {
  it('忘了(0) 重置 repetitions 并给短间隔', () => {
    const s = { easiness: 2.5, interval: 100, repetitions: 5 }
    const next = review(s, 0)
    expect(next.repetitions).toBe(0)
    expect(next.interval).toBe(10)
    expect(next.easiness).toBeLessThan(s.easiness)
  })

  it('模糊(1) 清零连续答对计数，间隔固定 30 分钟', () => {
    const s = { easiness: 2.5, interval: 60, repetitions: 2 }
    const next = review(s, 1)
    expect(next.repetitions).toBe(0)
    expect(next.interval).toBe(30)
    expect(next.easiness).toBeCloseTo(2.45)
  })

  it('认识(2) 未达 passN 走阶梯：60 → 360', () => {
    let s = defaultState()
    s = review(s, 2)
    expect(s.repetitions).toBe(1)
    expect(s.interval).toBe(60)
    s = review(s, 2)
    expect(s.repetitions).toBe(2)
    expect(s.interval).toBe(360)
  })

  it('认识(2) 连续 3 次（默认 passN）后已掌握，interval = 43200', () => {
    let s = defaultState()
    s = review(s, 2)
    s = review(s, 2)
    s = review(s, 2)
    expect(s.repetitions).toBe(3)
    expect(s.interval).toBe(43200)
    expect(s.easiness).toBeCloseTo(2.65)
  })

  it('传入 passN=2 时第 2 次认识(2) 即已掌握', () => {
    let s = defaultState()
    s = review(s, 2, 2)
    expect(s.interval).toBe(60)
    s = review(s, 2, 2)
    expect(s.repetitions).toBe(2)
    expect(s.interval).toBe(43200)
  })

  it('已掌握后再点认识(2) 仍归 30 天一档', () => {
    let s = defaultState()
    for (let i = 0; i < 3; i++) s = review(s, 2)
    s = review(s, 2)
    expect(s.interval).toBe(43200)
  })

  it('模糊(1) 打断连续答对后需重新累计', () => {
    let s = defaultState()
    s = review(s, 2) // reps 1
    s = review(s, 2) // reps 2
    s = review(s, 1) // 打断 → reps 0
    expect(s.repetitions).toBe(0)
    s = review(s, 2) // reps 1 → 60
    expect(s.interval).toBe(60)
  })

  it('easiness 不低于下限 1.3', () => {
    let s = defaultState()
    for (let i = 0; i < 20; i++) s = review(s, 0)
    expect(s.easiness).toBeGreaterThanOrEqual(1.3)
  })
})
