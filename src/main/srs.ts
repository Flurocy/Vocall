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

export function review(state: SrsState, grade: Grade): SrsState {
  let { easiness, interval, repetitions } = state

  if (grade === 0) {
    repetitions = 0
    interval = 10
    easiness = Math.max(MIN_EASINESS, easiness - 0.2)
  } else if (grade === 1) {
    repetitions += 1
    interval = interval <= 0 ? 30 : interval * 1.2
    easiness = Math.max(MIN_EASINESS, easiness - 0.05)
  } else {
    repetitions += 1
    if (repetitions === 1) interval = 60
    else if (repetitions === 2) interval = 360
    else interval = interval * easiness
    easiness = Math.min(3.0, easiness + 0.05)
  }

  return { easiness, interval, repetitions }
}
