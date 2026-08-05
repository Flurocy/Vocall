import { describe, it, expect, beforeEach } from 'vitest'
import { addVocab, updateVocab } from '../src/main/vocab'
import { applyReview, reviveVocab } from '../src/main/scheduler'
import {
  getSrsState, setSrsState, getForgotCounts, migrateForgotCount, _resetStoreForTests,
} from '../src/main/store'

// 造一个指定 status 的词（addVocab 默认 new 统一队列，这里按需提升；SRS 状态给齐四字段）
function make(status: 'learning' | 'review' = 'learning'): ReturnType<typeof addVocab> {
  const v = addVocab({ word: `w${Math.random()}`, meaning: 'm', example: 'e', topic: null, source: 's' })
  updateVocab(v.id, { status })
  setSrsState(v.id, { easiness: 2.5, repetitions: 0, duePop: 0, forgotCount: 0 })
  return v
}

describe('migrateForgotCount（旧 SRS 状态补 forgotCount=0，幂等）', () => {
  beforeEach(() => _resetStoreForTests())

  it('缺 forgotCount 字段的旧状态 → 补 0，其余字段不动', () => {
    // 旧持久化数据形态：三字段无 forgotCount
    setSrsState(1, { easiness: 2.4, repetitions: 3, duePop: 7 })
    migrateForgotCount()
    const s = getSrsState(1)!
    expect(s.forgotCount).toBe(0)
    expect(s.easiness).toBe(2.4)
    expect(s.repetitions).toBe(3)
    expect(s.duePop).toBe(7)
  })

  it('已有 forgotCount → 不动', () => {
    setSrsState(1, { easiness: 2.5, repetitions: 0, duePop: 0, forgotCount: 5 })
    migrateForgotCount()
    expect(getSrsState(1)!.forgotCount).toBe(5)
  })

  it('幂等：跑两次结果一致', () => {
    setSrsState(1, { easiness: 2.5, repetitions: 0, duePop: 0 }) // 旧形态
    setSrsState(2, { easiness: 2.5, repetitions: 1, duePop: 3, forgotCount: 2 })
    migrateForgotCount()
    const once = { ...getForgotCounts() }
    migrateForgotCount()
    expect(getForgotCounts()).toEqual(once)
    expect(getSrsState(1)!.forgotCount).toBe(0)
    expect(getSrsState(2)!.forgotCount).toBe(2)
  })
})

describe('applyReview 忘词计数（grade 0 → forgotCount+1，其余保留）', () => {
  beforeEach(() => _resetStoreForTests())

  it('learning 态 grade 0 两次 → forgotCount=2', () => {
    const v = make('learning')
    applyReview(v.id, 0)
    applyReview(v.id, 0)
    expect(getSrsState(v.id)!.forgotCount).toBe(2)
  })

  it('review 态 grade 0 打回 learning → forgotCount+1', () => {
    const v = make('review')
    applyReview(v.id, 0)
    expect(getSrsState(v.id)!.forgotCount).toBe(1)
  })

  it('grade 1 / grade 2 不增，已有计数原样保留', () => {
    const v = make('learning')
    applyReview(v.id, 0) // → 1
    applyReview(v.id, 1)
    expect(getSrsState(v.id)!.forgotCount).toBe(1)
    applyReview(v.id, 2) // reps=1 < passN=3，不毕业不补位
    expect(getSrsState(v.id)!.forgotCount).toBe(1)
  })

  it('旧状态无 forgotCount 字段时 grade 0 → 1（兼容旧数据）', () => {
    const v = addVocab({ word: 'legacy', meaning: 'm', example: 'e', topic: null, source: 's' })
    updateVocab(v.id, { status: 'learning' })
    setSrsState(v.id, { easiness: 2.5, repetitions: 0, duePop: 0 }) // 旧形态无 forgotCount
    applyReview(v.id, 0)
    expect(getSrsState(v.id)!.forgotCount).toBe(1)
  })

  it('reviveVocab 复活重背不丢 forgotCount（只增不减）', () => {
    const v = make('learning')
    applyReview(v.id, 0)
    applyReview(v.id, 0) // 攒到 2
    reviveVocab(v.id)
    expect(getSrsState(v.id)!.forgotCount).toBe(2)
  })
})
