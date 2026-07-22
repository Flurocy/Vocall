export type Grade = 0 | 1 | 2

export interface SrsState {
  easiness: number
  interval: number // 分钟
  repetitions: number
}

export function defaultState(): SrsState {
  return { easiness: 2.5, interval: 0, repetitions: 0 }
}

const MIN_EASINESS = 1.3
const MASTERED_INTERVAL = 43200 // 30 天（分钟）

// 连续答对 passN 次过关：repetitions 只在 grade 2 时累计，grade 0/1 都清零。
// 过关后固定 30 天一档（有意简化，不做无限增长）。
export function review(state: SrsState, grade: Grade, passN = 3): SrsState {
  let { easiness, interval, repetitions } = state

  if (grade === 0) {
    repetitions = 0
    interval = 10
    easiness = Math.max(MIN_EASINESS, easiness - 0.2)
  } else if (grade === 1) {
    // 模糊：打断连续答对计数，固定 30 分钟后再见
    repetitions = 0
    interval = 30
    easiness = Math.max(MIN_EASINESS, easiness - 0.05)
  } else {
    repetitions += 1
    if (repetitions >= passN) interval = MASTERED_INTERVAL
    else if (repetitions === 1) interval = 60
    else if (repetitions === 2) interval = 360
    else interval = interval * easiness
    easiness = Math.min(3.0, easiness + 0.05)
  }

  return { easiness, interval, repetitions }
}
