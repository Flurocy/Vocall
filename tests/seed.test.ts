import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests } from '../src/main/store'
import { seedIfEmpty } from '../src/main/seed'
import { listExpressions } from '../src/main/expressions'

describe('seed', () => {
  beforeEach(() => {
    _resetStoreForTests()
  })

  it('空库导入一批内置表达块', () => {
    const n = seedIfEmpty()
    expect(n).toBeGreaterThan(0)
    expect(listExpressions().length).toBe(n)
  })

  it('非空库不重复导入', () => {
    seedIfEmpty()
    expect(seedIfEmpty()).toBe(0)
  })
})
