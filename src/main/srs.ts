export type Grade = 0 | 1 | 2

// 弹窗节拍队列模型（详见 specs/2026-07-24-pop-count-queue-scheduler.md）：
// interval 一律表示"再过多少次弹窗出现"（duePop 的相对量），不是分钟/天。
export interface SrsState {
  easiness: number
  interval: number // 弹窗次数（相对量）
  repetitions: number
}

export function defaultState(): SrsState {
  return { easiness: 2.5, interval: 0, repetitions: 0 }
}

export interface ReviewOpts {
  passN: number
  forgotPops: number      // 忘了→过这么多次弹窗再出现
  fuzzyPops: number       // 模糊→过这么多次弹窗再出现
  learningSteps: number[] // learning 内"认识"递进（弹窗次数）
  reviewSteps: number[]   // review 阶梯（弹窗次数）
}

const MIN_EASINESS = 1.3

// learning 队列评分：连续答对 passN 次毕业（interval 返回首个 review 间隔=reviewSteps[0] 次）
export function reviewLearning(state: SrsState, grade: Grade, o: ReviewOpts): SrsState {
  let { easiness, interval, repetitions } = state
  if (grade === 0) {
    repetitions = 0
    interval = o.forgotPops
    easiness = Math.max(MIN_EASINESS, easiness - 0.2)
  } else if (grade === 1) {
    repetitions = 0
    interval = o.fuzzyPops
    easiness = Math.max(MIN_EASINESS, easiness - 0.05)
  } else {
    repetitions += 1
    if (repetitions >= o.passN) interval = o.reviewSteps[0] // 毕业：首个 review 间隔
    else interval = o.learningSteps[Math.min(repetitions - 1, o.learningSteps.length - 1)]
    easiness = Math.min(3.0, easiness + 0.05)
  }
  return { easiness, interval, repetitions }
}

// review 评分：认识→阶梯推进；模糊→×1.2；忘了由调用方打回 learning（此处 grade0 保底）
export function reviewReview(state: SrsState, grade: Grade, o: ReviewOpts): SrsState {
  let { easiness, interval, repetitions } = state
  if (grade === 1) {
    interval = Math.round(interval * 1.2)
    easiness = Math.max(MIN_EASINESS, easiness - 0.05)
  } else if (grade === 2) {
    repetitions += 1
    const steps = o.reviewSteps
    // interval 已是弹窗次数，找阶梯中第一个比它大的档；更大则封顶最后一档
    const next = steps.find((d) => d > interval) ?? steps[steps.length - 1]
    interval = next
    easiness = Math.min(3.0, easiness + 0.05)
  } else {
    // grade 0 在 review 由 scheduler 打回 learning，这里不预期收到；保底按忘了处理
    repetitions = 0
    interval = o.forgotPops
    easiness = Math.max(MIN_EASINESS, easiness - 0.2)
  }
  return { easiness, interval, repetitions }
}
