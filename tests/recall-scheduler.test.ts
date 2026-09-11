import { describe, it, expect, beforeEach } from 'vitest'
import { addVocab, listVocab, updateVocab } from '../src/main/vocab'
import {
  getDueVocab,
  applyReview,
  fillLearningQueue,
  advancePopToNextDue,
  pickPopupDirection,
} from '../src/main/scheduler'
import {
  getSrsState,
  setSrsState,
  _resetStoreForTests,
  getPopCount,
  incrementPop,
  getReviewEvents,
} from '../src/main/store'
import { setSetting } from '../src/main/settings'

// 反转回忆模式 包2 调度方向（设计稿 v1.6.1-反转回忆模式 §3.3）：
// - recall_mode_enabled 关闭：getDueVocab/pickPopupDirection 行为与现状逐字节一致（兼容锁）
// - 开启：有效到期 = min(顶层duePop, recall?.duePop ?? ∞)；方向按 recall_ratio 加权随机；
//   recall 未初始化 → 本次必走再认 + 懒初始化（duePop=当前 popCount）
// - applyReview 加 direction 参数（默认 'recognition' 保旧调用），按方向读写对应子状态

function make(status: 'new' | 'learning' | 'review', duePop = 0): ReturnType<typeof addVocab> {
  const v = addVocab({ word: `w${Math.random()}`, meaning: 'm', example: 'e', topic: null, source: 's' })
  updateVocab(v.id, { status })
  setSrsState(v.id, { easiness: 2.5, repetitions: 0, duePop, forgotCount: 0 })
  return v
}

const RECALL = { easiness: 2.5, repetitions: 0, duePop: 0, forgotCount: 0 }

describe('回忆模式门控：关闭=现状行为（兼容锁）', () => {
  beforeEach(() => _resetStoreForTests())

  it('关闭时 recall.duePop 更早也被无视（只认顶层 duePop）', () => {
    const v = make('learning', 100)
    setSrsState(v.id, { ...getSrsState(v.id)!, recall: { ...RECALL } }) // recall.duePop=0 已到期
    for (let i = 0; i < 50; i++) incrementPop() // popCount=50：recall 到期但顶层未到期
    expect(getDueVocab()).toBeNull() // 关闭时只看顶层 → 未到期
  })

  it('关闭时 pickPopupDirection 恒 recognition，且不初始化 recall', () => {
    const v = make('learning', 0)
    expect(pickPopupDirection(v.id)).toBe('recognition')
    expect(getSrsState(v.id)!.recall).toBeUndefined() // 不懒建
  })

  it('关闭时 fillLearningQueue 不为新词初始化 recall', () => {
    make('new', 0)
    fillLearningQueue()
    const w = listVocab()[0]
    expect(getSrsState(w.id)!.recall).toBeUndefined()
  })
})

describe('回忆模式开启：方向判定', () => {
  beforeEach(() => {
    _resetStoreForTests()
    setSetting('recall_mode_enabled', 'true')
    setSetting('recall_ratio', '70')
  })

  it('getDueVocab：recall.duePop 到期而顶层未到期 → 有效到期取 min，可选中', () => {
    const v = make('learning', 100)
    setSrsState(v.id, { ...getSrsState(v.id)!, recall: { ...RECALL } })
    expect(getDueVocab()!.id).toBe(v.id) // popCount=0，recall.duePop=0 到期
  })

  it('advancePopToNextDue：recall.duePop 比顶层更早 → 快进到 recall 到期点', () => {
    const v = make('learning', 100)
    setSrsState(v.id, { ...getSrsState(v.id)!, recall: { ...RECALL, duePop: 5 } })
    const r = advancePopToNextDue()
    expect(r).toEqual({ advanced: true, nextDue: 5 })
    expect(getPopCount()).toBe(5)
  })

  it('recall 未初始化 → 本次 recognition + 懒初始化（duePop=当前 popCount）', () => {
    for (let i = 0; i < 7; i++) incrementPop()
    const v = make('learning', 0)
    expect(pickPopupDirection(v.id)).toBe('recognition')
    const s = getSrsState(v.id)!
    expect(s.recall).toEqual({ easiness: 2.5, repetitions: 0, duePop: 7, forgotCount: 0 })
  })

  it('recall 已初始化 → 按 recall_ratio 加权随机（rng 可控）', () => {
    const v = make('learning', 0)
    setSrsState(v.id, { ...getSrsState(v.id)!, recall: { ...RECALL } })
    // ratio=70：rng<0.7 → recognition，否则 recall
    expect(pickPopupDirection(v.id, () => 0)).toBe('recognition')
    expect(pickPopupDirection(v.id, () => 0.69)).toBe('recognition')
    expect(pickPopupDirection(v.id, () => 0.7)).toBe('recall')
    expect(pickPopupDirection(v.id, () => 0.99)).toBe('recall')
  })

  it('recall_ratio=0 → 恒 recall；=100 → 恒 recognition', () => {
    const v = make('learning', 0)
    setSrsState(v.id, { ...getSrsState(v.id)!, recall: { ...RECALL } })
    setSetting('recall_ratio', '0')
    expect(pickPopupDirection(v.id, () => 0.5)).toBe('recall')
    setSetting('recall_ratio', '100')
    expect(pickPopupDirection(v.id, () => 0.5)).toBe('recognition')
  })

  it('开启时 fillLearningQueue 为新词一起初始化 recall（duePop=当前 popCount）', () => {
    for (let i = 0; i < 3; i++) incrementPop()
    make('new', 0)
    fillLearningQueue()
    const w = listVocab()[0]
    expect(getSrsState(w.id)!.recall).toEqual({ easiness: 2.5, repetitions: 0, duePop: 3, forgotCount: 0 })
  })
})

describe('applyReview direction 参数', () => {
  beforeEach(() => {
    _resetStoreForTests()
    setSetting('recall_mode_enabled', 'true')
  })

  it('默认 recognition：写顶层，recall 不动（旧调用兼容）', () => {
    const v = make('learning', 0)
    setSrsState(v.id, { ...getSrsState(v.id)!, recall: { ...RECALL, duePop: 42 } })
    applyReview(v.id, 2) // 无第三参
    const s = getSrsState(v.id)!
    expect(s.repetitions).toBe(1) // 顶层推进
    expect(s.recall).toEqual({ ...RECALL, duePop: 42 }) // recall 原样
  })

  it('direction=recall：只写 recall 子状态，顶层不动', () => {
    const v = make('learning', 0)
    setSrsState(v.id, { ...getSrsState(v.id)!, repetitions: 2, recall: { ...RECALL } })
    applyReview(v.id, 2, 'recall')
    const s = getSrsState(v.id)!
    expect(s.repetitions).toBe(2) // 顶层不动
    expect(s.recall!.repetitions).toBe(1) // recall 推进
    expect(s.recall!.duePop).toBe(getPopCount() + 1) // learningSteps[0]=1
  })

  it('recall 方向 grade 0：recall.forgotCount+1，顶层 forgotCount 不变', () => {
    const v = make('learning', 0)
    setSrsState(v.id, { ...getSrsState(v.id)!, forgotCount: 5, recall: { ...RECALL } })
    applyReview(v.id, 0, 'recall')
    const s = getSrsState(v.id)!
    expect(s.forgotCount).toBe(5)
    expect(s.recall!.forgotCount).toBe(1)
    expect(s.recall!.duePop).toBe(getPopCount() + 3) // forgotPops=3
  })

  it('recall 方向答对共享 status 生命周期：满 passN 毕业升 review', () => {
    setSetting('pass_count', '2')
    const v = make('learning', 0)
    setSrsState(v.id, { ...getSrsState(v.id)!, recall: { ...RECALL } })
    applyReview(v.id, 2, 'recall')
    expect(listVocab().find((x) => x.id === v.id)!.status).toBe('learning')
    applyReview(v.id, 2, 'recall') // recall 方向 reps 满 2 → 毕业
    expect(listVocab().find((x) => x.id === v.id)!.status).toBe('review')
  })

  it('ReviewEvent 记录 direction（recall 方向答题）', () => {
    const v = make('learning', 0)
    setSrsState(v.id, { ...getSrsState(v.id)!, recall: { ...RECALL } })
    applyReview(v.id, 1, 'recall')
    applyReview(v.id, 1) // recognition 默认
    const evs = getReviewEvents()
    expect(evs[0].direction).toBe('recall')
    expect(evs[1].direction).toBe('recognition')
  })
})
