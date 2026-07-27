import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests, getSrsState } from '../src/main/store'
import { addVocab, listVocab, updateVocab } from '../src/main/vocab'
import { getDueVocab, applyReview, fillLearningQueue } from '../src/main/scheduler'
import { setSetting } from '../src/main/settings'

// 造词辅助：默认 status='learning'（手动/种子词）；传 status:'new' 模拟词书未解锁词
function mk(status?: 'new' | 'learning' | 'review') {
  return addVocab({ word: 'p', meaning: 'a', example: 'e', topic: null, source: '内置', status })
}

describe('调度器', () => {
  beforeEach(() => {
    _resetStoreForTests() // 内存态重置，避免测试间互相污染
  })

  it('learning 词到期则返回该生词', () => {
    const expr = mk()
    const due = getDueVocab(Date.now())
    expect(due).not.toBeNull()
    expect(due!.id).toBe(expr.id)
  })

  it('new 状态的词不会被 getDueVocab 选中', () => {
    mk('new')
    expect(getDueVocab(Date.now())).toBeNull()
  })

  it('learning 评分"认识"后短时间内不再到期', () => {
    const expr = mk()
    applyReview(expr.id, 2, Date.now())
    expect(getDueVocab(Date.now())).toBeNull()
  })

  it('learning 评分"忘了"后 5 分钟再次到期', () => {
    const expr = mk()
    applyReview(expr.id, 2, Date.now())
    applyReview(expr.id, 0, Date.now())
    // forgot_gap_min 默认 5 分钟 → 用 6 分钟后的时间戳判定
    expect(getDueVocab(Date.now() + 6 * 60 * 1000)).not.toBeNull()
  })

  it('learning 连续答对 pass_count 次后毕业：status 变 review，due_at ≈ now + 1 天', () => {
    const expr = mk()
    const now = Date.now()
    applyReview(expr.id, 2, now)
    applyReview(expr.id, 2, now)
    expect(listVocab().find((v) => v.id === expr.id)!.status).toBe('learning') // 2 次还没毕业
    applyReview(expr.id, 2, now)
    expect(listVocab().find((v) => v.id === expr.id)!.status).toBe('review')
    expect(getSrsState(expr.id)!.due_at).toBe(now + 1440 * 60 * 1000)
  })

  it('pass_count 非法值兜底为 3', () => {
    setSetting('pass_count', 'abc')
    const expr = mk()
    const now = Date.now()
    applyReview(expr.id, 2, now)
    applyReview(expr.id, 2, now)
    // 兜底 3：两次还在 learning，interval 走 learningSteps[1]=60
    expect(getSrsState(expr.id)!.interval).toBe(60)
    applyReview(expr.id, 2, now)
    expect(getSrsState(expr.id)!.due_at).toBe(now + 1440 * 60 * 1000)
  })

  it('learning 毕业空位后自动从 new 补位（id 升序，due_at=now 立即可弹）', () => {
    setSetting('learning_cap', '1')
    const learner = mk() // learning，占满 cap=1
    const newA = mk('new')
    const newB = mk('new')
    const now = Date.now()
    applyReview(learner.id, 2, now)
    applyReview(learner.id, 2, now)
    applyReview(learner.id, 2, now) // 毕业 → 触发补位
    const list = listVocab()
    expect(list.find((v) => v.id === newA.id)!.status).toBe('learning') // id 小的先补
    expect(list.find((v) => v.id === newB.id)!.status).toBe('new') // cap=1，只补一个
    expect(getSrsState(newA.id)!.due_at).toBe(now)
  })

  it('fillLearningQueue：learning 不满 cap 时从 new 补足', () => {
    setSetting('learning_cap', '2')
    const a = mk('new')
    const b = mk('new')
    const c = mk('new')
    const now = Date.now()
    fillLearningQueue(now)
    const list = listVocab()
    expect(list.find((v) => v.id === a.id)!.status).toBe('learning')
    expect(list.find((v) => v.id === b.id)!.status).toBe('learning')
    expect(list.find((v) => v.id === c.id)!.status).toBe('new') // 补满 cap 即停
    expect(getDueVocab(now)!.id).toBe(a.id) // 新补的词立即可弹
  })

  it('review 的词点忘了 → status 打回 learning、due_at ≈ 5 分钟后', () => {
    const expr = mk()
    updateVocab(expr.id, { status: 'review' })
    const now = Date.now()
    applyReview(expr.id, 0, now)
    expect(listVocab().find((v) => v.id === expr.id)!.status).toBe('learning')
    const s = getSrsState(expr.id)!
    expect(s.repetitions).toBe(0)
    expect(s.due_at).toBe(now + 5 * 60 * 1000)
  })

  it('review 的词点认识 → 按阶梯推进（1天→3天），status 保持 review', () => {
    const expr = mk()
    updateVocab(expr.id, { status: 'review' })
    const now = Date.now()
    applyReview(expr.id, 2, now) // interval 0 → 首个阶梯 1 天
    expect(getSrsState(expr.id)!.due_at).toBe(now + 1440 * 60 * 1000)
    applyReview(expr.id, 2, now) // 1 天 → 3 天
    expect(getSrsState(expr.id)!.due_at).toBe(now + 3 * 1440 * 60 * 1000)
    expect(listVocab().find((v) => v.id === expr.id)!.status).toBe('review')
  })
})
