import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { addVocab, addVocabBatch, listVocab, updateVocab } from '../src/main/vocab'
import { getDueVocab, applyReview, fillLearningQueue, masterVocab, reviveVocab, advancePopToNextDue } from '../src/main/scheduler'
import { getSrsState, setSrsState, _resetStoreForTests, getPopCount, incrementPop } from '../src/main/store'
import { setSetting } from '../src/main/settings'
import { _logTest } from '../src/main/logger'

// 造一个指定 status 的词（addVocab 默认 new 统一队列，这里按需提升）
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

  it('添加即补位语义（复现用户场景）：批量加 50 词全 new → fill 后前 cap 个按 id 升序学习中，其余排队', () => {
    setSetting('learning_cap', '3')
    addVocabBatch(['a', 'b', 'c', 'd', 'e'].map((w) => ({ word: w, meaning: 'm', example: 'e', topic: null, source: 's' })))
    expect(listVocab().every((v) => v.status === 'new')).toBe(true) // 统一队列：添加一律 new
    fillLearningQueue() // = ipc 层 vocab:addBatch 后的补位调用
    const learning = listVocab().filter((v) => v.status === 'learning').map((v) => v.word)
    expect(learning).toEqual(['a', 'b', 'c']) // 前 3 个（id 升序）立即学习中 = 分界线上方
    expect(listVocab().filter((v) => v.status === 'new')).toHaveLength(2)
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

  it('手动 masterVocab 一个 learning 词 → 触发 fillLearningQueue 补位（learning 队列不静默缩水）', () => {
    setSetting('learning_cap', '2')
    const a = make('learning', 0)
    make('learning', 0) // 满员 2
    const c = make('new', 0) // 队外待补
    masterVocab(a.id) // a → mastered，应腾出 1 个槽位
    expect(listVocab().find((x) => x.id === c.id)!.status).toBe('learning') // new 被补成 learning
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

// 时钟快进：修"再也不弹词"死锁（所有词 duePop 在未来、popCount 停摆）
describe('advancePopToNextDue 时钟快进', () => {
  beforeEach(() => _resetStoreForTests())

  it('单词小库死锁：答完题 duePop=popCount+1，快进后词重新到期可弹', () => {
    setSetting('pass_count', '3')
    const v = make('learning', 0)
    applyReview(v.id, 2) // reps=1 <3，duePop = popCount+learningSteps[0]=+1
    // 此时 duePop(popCount+1) > popCount → getDueVocab 为 null（死锁态）
    expect(getDueVocab()).toBeNull()
    const r = advancePopToNextDue()
    expect(r.advanced).toBe(true)
    expect(getPopCount()).toBe(getSrsState(v.id)!.duePop) // 时钟追到该词到期点
    expect(getDueVocab()!.id).toBe(v.id) // 解冻，可再弹
  })

  it('全部词在未来（学完一本书）：快进到最近到期点', () => {
    const a = make('review', 100)
    const b = make('review', 50) // 最近的到期点
    const r = advancePopToNextDue()
    expect(r.advanced).toBe(true)
    expect(r.nextDue).toBe(50)
    expect(getPopCount()).toBe(50)
    expect(getDueVocab()!.id).toBe(b.id) // 最该见的 b 到期
    expect(a.id).not.toBe(b.id)
  })

  it('已有到期词时不快进（advanced=false，popCount 不变）', () => {
    make('learning', 0) // duePop=0 <= popCount=0，已到期
    const before = getPopCount()
    const r = advancePopToNextDue()
    expect(r.advanced).toBe(false)
    expect(getPopCount()).toBe(before)
  })

  it('队列真空（无 learning/review 词）：nextDue=null 不快进', () => {
    make('new', 0)
    make('mastered', 0)
    const r = advancePopToNextDue()
    expect(r.advanced).toBe(false)
    expect(r.nextDue).toBeNull()
    expect(getDueVocab()).toBeNull() // 快进也救不了真空白，引擎走 15s 空转
  })
})

// 调度日志（tracker）：评分与时钟快进应留痕，供"不弹词"问题回溯
describe('调度日志', () => {
  beforeEach(() => { _resetStoreForTests(); _logTest.start() })
  afterEach(() => _logTest.stop())

  it('applyReview 记一行评分日志（含 duePop 变化与 grade）', () => {
    const v = make('learning', 0)
    applyReview(v.id, 0) // 忘了
    expect(_logTest.lines.some((l) => l.includes('review') && l.includes('grade=0') && l.includes('duePop'))).toBe(true)
  })

  it('评分导致毕业时在日志里体现 status 变化', () => {
    setSetting('pass_count', '1')
    const v = make('learning', 0)
    applyReview(v.id, 2) // 毕业 learning→review
    expect(_logTest.lines.some((l) => l.includes('learning→review'))).toBe(true)
  })
})
