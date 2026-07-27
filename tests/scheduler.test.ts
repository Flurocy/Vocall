import { describe, it, expect, beforeEach } from 'vitest'
import { addVocab, listVocab, updateVocab } from '../src/main/vocab'
import { getDueVocab, applyReview, fillLearningQueue } from '../src/main/scheduler'
import { getSrsState, setSrsState, _resetStoreForTests, getPopCount, incrementPop } from '../src/main/store'
import { setSetting } from '../src/main/settings'

// 造一个指定 status 的词（addVocab 默认 learning，再按需改）
function make(status: 'new' | 'learning' | 'review', duePop = 0): ReturnType<typeof addVocab> {
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
    expect(getSrsState(v.id)!.duePop).toBe(getPopCount() + 80) // reviewSteps[0]
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
