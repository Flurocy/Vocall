import { describe, it, expect, beforeEach } from 'vitest'
import {
  addVocab, listVocab, updateVocab, deleteVocab,
} from '../src/main/vocab'
import { _resetStoreForTests, getSrsState } from '../src/main/store'

describe('vocab CRUD (electron-store)', () => {
  beforeEach(() => {
    _resetStoreForTests() // 用内存态重置，避免测试间互相污染
  })

  it('adds and lists a vocab item, auto-increments id', () => {
    const a = addVocab({
      word: 'curriculum', meaning: 'n. 课程体系；（学校的）全部课程',
      example: 'The school has reformed its curriculum to include more practical skills.',
      topic: '教育', source: '内置',
    })
    const b = addVocab({
      word: 'abandon', meaning: 'v. 放弃；抛弃',
      example: 'They had to abandon the project due to lack of funding.', topic: null, source: '内置',
    })
    expect(b.id).toBeGreaterThan(a.id)
    const all = listVocab()
    expect(all).toHaveLength(2)
    expect(all[0].meaning).toBe('n. 课程体系；（学校的）全部课程')
  })

  it('initializes srs state on add', () => {
    const a = addVocab({
      word: 'x', meaning: 'y', example: 'z', topic: null, source: '手动',
    })
    const s = getSrsState(a.id)
    expect(s).toBeTruthy()
    expect(s.easiness).toBe(2.5)
    expect(s.repetitions).toBe(0)
  })

  it('updates and deletes', () => {
    const a = addVocab({
      word: 'a', meaning: 'b', example: 'c', topic: null, source: '手动',
    })
    updateVocab(a.id, { meaning: 'b2' })
    expect(listVocab().find(e => e.id === a.id)!.meaning).toBe('b2')
    deleteVocab(a.id)
    expect(listVocab()).toHaveLength(0)
    expect(getSrsState(a.id)).toBeDefined() // 软删除：srs 状态保留供回收站还原
  })
})
