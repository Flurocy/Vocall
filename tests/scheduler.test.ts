import { describe, it, expect, beforeEach } from 'vitest'
import { addVocab, listVocab, updateVocab } from '../src/main/vocab'
import { getDueVocab, applyReview, fillLearningQueue, masterVocab, reviveVocab } from '../src/main/scheduler'
import { getSrsState, setSrsState, _resetStoreForTests, getPopCount, incrementPop } from '../src/main/store'
import { setSetting } from '../src/main/settings'

// 造一个指定 status 的词（addVocab 默认 learning，再按需改）
function make(status: 'new' | 'learning' | 'review' | 'mastered', duePop = 0): ReturnType<typeof addVocab> {
  const v = addVocab({ word: `w${Math.random()}`, meaning: 'm', example: 'e', topic: null, source: 's' })
  updateVocab(v.id, { status })
  setSrsState(v.id, { easiness: 2.5, repetitions: 0, duePop })
  return v
}

describe('弹窗节拍调度', () => {
  beforeEach(() => _resetStoreForTests())

  it('new 词不会被选中；learning 到期被选中', () => {
    make('new', 0)
    expect(getDueVocab()).toBeNull()
    make('learning', 0)
    expect(getDueVocab()).not.toBeNull()
  })

  it('duePop > popCount 的词不弹，递增 popCount 后到期', () => {
    const v = make('learning', 5)
    expect(getDueVocab()).toBeNull() // popCount=0 < 5
    for (let i = 0; i < 5; i++) incrementPop()
    expect(getDueVocab()!.id).toBe(v.id)
  })

  it('learning 忘了→3次后再见（duePop=popCount+3）', () => {
    const v = make('learning', 0)
    applyReview(v.id, 0)
    expect(getSrsState(v.id)!.duePop).toBe(getPopCount() + 3)
    expect(getSrsState(v.id)!.repetitions).toBe(0)
  })

  it('learning 连续答对 passN 次毕业→status=review，duePop 进首个复习阶梯', () => {
    setSetting('pass_count', '2')
    const v = make('learning', 0)
    applyReview(v.id, 2)
    expect(listVocab().find((x) => x.id === v.id)!.status).toBe('learning')
    applyReview(v.id, 2) // 满 2 次毕业
    expect(listVocab().find((x) => x.id === v.id)!.status).toBe('review')
    expect(getSrsState(v.id)!.duePop).toBe(getPopCount() + 50) // reviewSteps[0]（新默认 50）
  })

  it('review 忘了→打回 learning', () => {
    const v = make('review', 0)
    applyReview(v.id, 0)
    expect(listVocab().find((x) => x.id === v.id)!.status).toBe('learning')
    expect(getSrsState(v.id)!.duePop).toBe(getPopCount() + 3)
  })

  it('毕业空位→fillLearningQueue 从 new 补位', () => {
    setSetting('learning_cap', '1')
    setSetting('pass_count', '1')
    const a = make('learning', 0)
    const b = make('new', 0)
    applyReview(a.id, 2) // a 毕业（passN=1）→ 触发补位
    expect(listVocab().find((x) => x.id === b.id)!.status).toBe('learning')
  })

  it('fillLearningQueue 补到 cap 为止', () => {
    setSetting('learning_cap', '2')
    make('new', 0); make('new', 0); make('new', 0)
    fillLearningQueue()
    expect(listVocab().filter((x) => x.status === 'learning')).toHaveLength(2)
  })
})

// 已掌握终态：review 答对爬到倒数第二档后判毕业，不再弹
describe('mastered 终态', () => {
  beforeEach(() => _resetStoreForTests())

  it('review 连续答对爬到倒数第二档 → status=mastered', () => {
    setSetting('review_steps_pops', '50,150,350,750,1500')
    const v = make('review', 0)
    // reviewReview grade2：interval 推进到第一个比它大的档，逐次爬到倒数第二档 750 即触发掌握
    applyReview(v.id, 2) // 0 → 50
    applyReview(v.id, 2) // 50 → 150
    applyReview(v.id, 2) // 150 → 350
    applyReview(v.id, 2) // 350 → 750 = masterStep（倒数第二档）→ mastered
    expect(listVocab().find((x) => x.id === v.id)!.status).toBe('mastered')
  })

  it('mastered 词不被 getDueVocab 选中', () => {
    make('mastered', 0) // duePop 已到期，但 mastered 应被跳过
    expect(getDueVocab()).toBeNull()
    const v = make('learning', 0) // 另一条到期 learning 应被选中
    expect(getDueVocab()!.id).toBe(v.id)
  })

  it('masterVocab(id) → status=mastered', () => {
    const v = make('learning', 0)
    masterVocab(v.id)
    expect(listVocab().find((x) => x.id === v.id)!.status).toBe('mastered')
  })

  it('reviveVocab(id) → status=learning + duePop=当前 popCount + reps=0', () => {
    const v = make('mastered', 100)
    incrementPop(); incrementPop() // popCount = 2
    reviveVocab(v.id)
    const w = listVocab().find((x) => x.id === v.id)!
    const s = getSrsState(v.id)!
    expect(w.status).toBe('learning')
    expect(s.repetitions).toBe(0)
    expect(s.easiness).toBe(2.5)
    expect(s.duePop).toBe(getPopCount()) // 立即可弹
  })
})
