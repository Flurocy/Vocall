import { describe, it, expect } from 'vitest'
import { defaultState, reviewLearning, reviewReview } from '../src/main/srs'

// 弹窗节拍队列模型：所有 interval 都是"弹窗次数"（duePop 的相对量），不是分钟。
const OPTS = {
  passN: 3,
  forgotPops: 3,
  fuzzyPops: 8,
  learningSteps: [1, 2],            // 第1次认识过1次、第2次过2次再弹
  reviewSteps: [80, 240, 560, 1200, 2400], // 复习阶梯（弹窗次数）
}

describe('learning 队列（节拍）', () => {
  it('忘了→清零+3次后再弹', () => {
    const s = reviewLearning({ easiness: 2.5, interval: 5, repetitions: 2 }, 0, OPTS)
    expect(s.repetitions).toBe(0)
    expect(s.interval).toBe(3)
  })
  it('模糊→清零+8次后再弹', () => {
    const s = reviewLearning(defaultState(), 1, OPTS)
    expect(s.repetitions).toBe(0)
    expect(s.interval).toBe(8)
  })
  it('认识递进1→2，满3次毕业给首个复习间隔80', () => {
    let s = defaultState()
    s = reviewLearning(s, 2, OPTS); expect(s.interval).toBe(1)   // 第1次
    s = reviewLearning(s, 2, OPTS); expect(s.interval).toBe(2)   // 第2次
    s = reviewLearning(s, 2, OPTS); expect(s.interval).toBe(80)  // 毕业→首个复习阶梯
  })
})

describe('review 阶梯（节拍）', () => {
  it('认识→按阶梯推进 80→240→560', () => {
    let s = { easiness: 2.5, interval: 80, repetitions: 0 }
    s = reviewReview(s, 2, OPTS); expect(s.interval).toBe(240)
    s = reviewReview(s, 2, OPTS); expect(s.interval).toBe(560)
  })
  it('模糊→间隔×1.2保持review', () => {
    const s = reviewReview({ easiness: 2.5, interval: 240, repetitions: 0 }, 1, OPTS)
    expect(s.interval).toBeCloseTo(288)
  })
  it('封顶2400', () => {
    let s = { easiness: 2.5, interval: 2400, repetitions: 0 }
    s = reviewReview(s, 2, OPTS); expect(s.interval).toBe(2400)
  })
  it('忘了（保底）→清零+3次', () => {
    const s = reviewReview({ easiness: 2.5, interval: 240, repetitions: 0 }, 0, OPTS)
    expect(s.repetitions).toBe(0)
    expect(s.interval).toBe(3)
  })
})
