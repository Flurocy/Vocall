import { describe, it, expect } from 'vitest'
import { defaultState, reviewLearning, reviewReview } from '../src/main/srs'

const OPTS = { passN: 3, forgotMin: 5, fuzzyMin: 20, learningSteps: [10, 60], reviewSteps: [1, 3, 7, 15, 30] }

describe('learning 队列', () => {
  it('忘了→清零+5分钟', () => {
    const s = reviewLearning({ easiness: 2.5, interval: 60, repetitions: 2 }, 0, OPTS)
    expect(s.repetitions).toBe(0)
    expect(s.interval).toBe(5)
  })

  it('模糊→清零+20分钟', () => {
    const s = reviewLearning(defaultState(), 1, OPTS)
    expect(s.repetitions).toBe(0)
    expect(s.interval).toBe(20)
  })

  it('认识递进10→60，满3次毕业(进首个review间隔1天)', () => {
    let s = defaultState()
    s = reviewLearning(s, 2, OPTS)
    expect(s.interval).toBe(10) // 第1次
    s = reviewLearning(s, 2, OPTS)
    expect(s.interval).toBe(60) // 第2次
    s = reviewLearning(s, 2, OPTS)
    expect(s.interval).toBe(1440) // 毕业→1天
  })

  it('easiness 不低于下限 1.3', () => {
    let s = defaultState()
    for (let i = 0; i < 20; i++) s = reviewLearning(s, 0, OPTS)
    expect(s.easiness).toBeGreaterThanOrEqual(1.3)
  })
})

describe('review 阶梯', () => {
  it('认识→按阶梯推进 1→3→7天', () => {
    let s = { easiness: 2.5, interval: 1440, repetitions: 0 }
    s = reviewReview(s, 2, OPTS)
    expect(s.interval).toBe(3 * 1440)
    s = reviewReview(s, 2, OPTS)
    expect(s.interval).toBe(7 * 1440)
  })

  it('模糊→间隔×1.2保持review', () => {
    const s = reviewReview({ easiness: 2.5, interval: 1440, repetitions: 0 }, 1, OPTS)
    expect(s.interval).toBeCloseTo(1440 * 1.2)
  })

  it('封顶30天', () => {
    let s = { easiness: 2.5, interval: 21600, repetitions: 0 }
    s = reviewReview(s, 2, OPTS)
    expect(s.interval).toBe(30 * 1440)
    s = reviewReview(s, 2, OPTS)
    expect(s.interval).toBe(30 * 1440) // 不超
  })
})
