import { describe, it, expect, beforeEach } from 'vitest'
import {
  addExpression, listExpressions, updateExpression, deleteExpression,
} from '../src/main/expressions'
import { _resetStoreForTests, getSrsState } from '../src/main/store'

describe('expressions CRUD (electron-store)', () => {
  beforeEach(() => {
    _resetStoreForTests() // 用内存态重置，避免测试间互相污染
  })

  it('adds and lists an expression, auto-increments id', () => {
    const a = addExpression({
      plain: 'important', advanced: 'plays a pivotal role in',
      example: 'Education plays a pivotal role in social mobility.',
      topic: '教育', source: '内置',
    })
    const b = addExpression({
      plain: 'good', advanced: 'remarkable',
      example: 'a remarkable improvement', topic: null, source: '内置',
    })
    expect(b.id).toBeGreaterThan(a.id)
    const all = listExpressions()
    expect(all).toHaveLength(2)
    expect(all[0].advanced).toBe('plays a pivotal role in')
  })

  it('initializes srs state on add', () => {
    const a = addExpression({
      plain: 'x', advanced: 'y', example: 'z', topic: null, source: '手动',
    })
    const s = getSrsState(a.id)
    expect(s).toBeTruthy()
    expect(s.easiness).toBe(2.5)
    expect(s.repetitions).toBe(0)
  })

  it('updates and deletes', () => {
    const a = addExpression({
      plain: 'a', advanced: 'b', example: 'c', topic: null, source: '手动',
    })
    updateExpression(a.id, { advanced: 'b2' })
    expect(listExpressions().find(e => e.id === a.id)!.advanced).toBe('b2')
    deleteExpression(a.id)
    expect(listExpressions()).toHaveLength(0)
    expect(getSrsState(a.id)).toBeUndefined() // 删除时联动清掉 srs 状态
  })
})
