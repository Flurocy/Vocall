export type Grade = 0 | 1 | 2

export interface SrsState {
  easiness: number
  interval: number // 分钟
  repetitions: number
}

export function defaultState(): SrsState {
  return { easiness: 2.5, interval: 0, repetitions: 0 }
}

export interface ReviewOpts {
  passN: number
  forgotMin: number
  fuzzyMin: number
  learningSteps: number[] // learning 内"认识"递进（分钟）
  reviewSteps: number[]   // review 阶梯（天）
}

const MIN_EASINESS = 1.3

// learning 队列评分：连续答对 passN 次毕业（interval 返回首个 review 间隔=reviewSteps[0]天，单位分钟）
export function reviewLearning(state: SrsState, grade: Grade, o: ReviewOpts): SrsState {
  let { easiness, interval, repetitions } = state
  if (grade === 0) {
    repetitions = 0
    interval = o.forgotMin
    easiness = Math.max(MIN_EASINESS, easiness - 0.2)
  } else if (grade === 1) {
    repetitions = 0
    interval = o.fuzzyMin
    easiness = Math.max(MIN_EASINESS, easiness - 0.05)
  } else {
    repetitions += 1
    if (repetitions >= o.passN) interval = o.reviewSteps[0] * 1440 // 毕业：首个 review 间隔
    else interval = o.learningSteps[Math.min(repetitions - 1, o.learningSteps.length - 1)]
    easiness = Math.min(3.0, easiness + 0.05)
  }
  return { easiness, interval, repetitions }
}

// review 评分：认识→阶梯推进；模糊→×1.2；忘了由调用方负责打回 learning（此处不处理 grade0 的 status 变更）
export function reviewReview(state: SrsState, grade: Grade, o: ReviewOpts): SrsState {
  let { easiness, interval, repetitions } = state
  if (grade === 1) {
    interval = Math.round(interval * 1.2)
    easiness = Math.max(MIN_EASINESS, easiness - 0.05)
  } else if (grade === 2) {
    repetitions += 1
    const daySteps = o.reviewSteps
    const curDay = interval / 1440
    const nextDay = daySteps.find((d) => d > curDay) ?? daySteps[daySteps.length - 1]
    interval = nextDay * 1440
    easiness = Math.min(3.0, easiness + 0.05)
  } else {
    // grade 0 在 review 由 scheduler 打回 learning，这里不预期收到；保底按忘了处理
    repetitions = 0
    interval = o.forgotMin
    easiness = Math.max(MIN_EASINESS, easiness - 0.2)
  }
  return { easiness, interval, repetitions }
}
