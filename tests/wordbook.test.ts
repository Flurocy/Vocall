import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests } from '../src/main/store'
import { listWordbooks, addWordbookToPlan, removeWordbookFromPlan } from '../src/main/wordbook'
import { addVocab, listVocab, updateVocab } from '../src/main/vocab'

describe('词书（wordbook）', () => {
  beforeEach(() => _resetStoreForTests())

  it('listWordbooks 返回 2 本且词数>0', () => {
    const books = listWordbooks()
    expect(books.length).toBeGreaterThanOrEqual(2)
    for (const b of books) {
      expect(b.count).toBeGreaterThan(0)
      expect(b.name).toBeTruthy()
    }
  })

  it('加入词书：词以 status=new、book=词书id 入库', () => {
    const n = addWordbookToPlan('ielts-core')
    expect(n).toBeGreaterThan(0)
    const inLib = listVocab().filter((v) => v.book === 'ielts-core')
    expect(inLib).toHaveLength(n)
    expect(inLib.every((v) => v.status === 'new')).toBe(true)
  })

  it('重复加入同书 → 返回 0', () => {
    addWordbookToPlan('ielts-core')
    expect(addWordbookToPlan('ielts-core')).toBe(0)
  })

  it('移除只删 status=new 的词，learning/review 中的保留', () => {
    addWordbookToPlan('ielts-core')
    // 把其中两个词改成 learning/review（模拟已在学）
    const core = listVocab().filter((v) => v.book === 'ielts-core')
    const total = core.length
    const [a, b] = core
    // 直接通过 updateVocab 改 status（绕过调度）
    updateVocab(a.id, { status: 'learning' })
    updateVocab(b.id, { status: 'review' })

    const removed = removeWordbookFromPlan('ielts-core')
    expect(removed).toBe(total - 2) // 只删 new 的
    const remaining = listVocab().filter((v) => v.book === 'ielts-core')
    expect(remaining).toHaveLength(2) // learning/review 的留下
  })

  it('移除不存在的词书返回 0，不影响其它词', () => {
    addVocab({ word: 'x', meaning: 'm', example: 'e', topic: null, source: '手动' })
    expect(removeWordbookFromPlan('no-such-book')).toBe(0)
    expect(listVocab()).toHaveLength(1)
  })
})
