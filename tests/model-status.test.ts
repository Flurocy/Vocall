import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests, migrateVocabStatus, vocabBox } from '../src/main/store'
import { addVocab, listVocab } from '../src/main/vocab'
import { DEFAULT_SETTINGS, getAllSettings } from '../src/main/settings'

// 包1：VocabItem 加 status/book 字段 + 弹性数值默认值 + 旧数据迁移
describe('包1 数据模型（status/book + 弹性数值 + 迁移）', () => {
  beforeEach(() => {
    _resetStoreForTests()
  })

  it('addVocab 默认 status=new（统一队列，由 fillLearningQueue 补位提升）、book=null', () => {
    const a = addVocab({
      word: 'curriculum', meaning: 'n. 课程体系', example: 'x', topic: '教育', source: '内置',
    })
    expect(a.status).toBe('new')
    expect(a.book).toBeNull()
    expect(listVocab()[0].status).toBe('new')
  })

  it('弹性数值默认值齐全', () => {
    expect(DEFAULT_SETTINGS.learning_cap).toBe('10')
    expect(DEFAULT_SETTINGS.forgot_gap_pops).toBe('3')
    expect(DEFAULT_SETTINGS.fuzzy_gap_pops).toBe('8')
    expect(DEFAULT_SETTINGS.learning_step_pops).toBe('1,2')
    expect(DEFAULT_SETTINGS.review_steps_pops).toBe('50,150,350,750,1500')
    const all = getAllSettings()
    expect(all.learning_cap).toBe('10')
  })

  it('迁移：旧词缺 status/book 时补齐默认值', () => {
    // 模拟旧数据：直接往 vocabBox 塞一条没有 status/book 的词（绕过 addVocab）
    vocabBox.set([
      { id: 1, word: 'old', meaning: 'm', example: 'e', topic: null, source: '内置', created_at: 1 } as never,
    ])
    migrateVocabStatus()
    const w = vocabBox.get()[0] as unknown as Record<string, unknown>
    expect(w.status).toBe('learning')
    expect(w.book).toBeNull()
  })

  it('迁移：已有 status 的词不被覆盖', () => {
    vocabBox.set([
      { id: 1, word: 'w', meaning: 'm', example: 'e', topic: null, book: 'core', status: 'review', source: 's', created_at: 1 },
    ])
    migrateVocabStatus()
    const w = vocabBox.get()[0]
    expect(w.status).toBe('review') // 不被重置成 learning
    expect(w.book).toBe('core')
  })
})
