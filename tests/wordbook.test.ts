import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests } from '../src/main/store'
import { listWordbooks, addWordbookToPlan, removeWordbookFromPlan } from '../src/main/wordbook'
import { addVocab, listVocab, listTrash, updateVocab } from '../src/main/vocab'

describe('词书（wordbook）', () => {
  beforeEach(() => _resetStoreForTests())

  it('listWordbooks 返回词书且词数>0', () => {
    const books = listWordbooks()
    // 内置 5 本话题词书（居家出行/校园健康/社会文娱/科技环境/政经法理）
    expect(books.length).toBeGreaterThanOrEqual(5)
    for (const b of books) {
      expect(b.count).toBeGreaterThan(0)
      expect(b.name).toBeTruthy()
    }
  })

  it('加入词书：词以 status=new、book=词书id 入库', () => {
    const n = addWordbookToPlan('ielts-daily')
    expect(n).toBeGreaterThan(0)
    const inLib = listVocab().filter((v) => v.book === 'ielts-daily')
    expect(inLib).toHaveLength(n)
    expect(inLib.every((v) => v.status === 'new')).toBe(true)
  })

  it('重复加入同书 → 返回 0', () => {
    addWordbookToPlan('ielts-daily')
    expect(addWordbookToPlan('ielts-daily')).toBe(0)
  })

  it('移除只删 status=new 的词，learning/review 中的保留', () => {
    addWordbookToPlan('ielts-daily')
    // 把其中两个词改成 learning/review（模拟已在学）
    const core = listVocab().filter((v) => v.book === 'ielts-daily')
    const total = core.length
    const [a, b] = core
    // 直接通过 updateVocab 改 status（绕过调度）
    updateVocab(a.id, { status: 'learning' })
    updateVocab(b.id, { status: 'review' })

    const removed = removeWordbookFromPlan('ielts-daily')
    expect(removed).toBe(total - 2) // 只删 new 的
    const remaining = listVocab().filter((v) => v.book === 'ielts-daily')
    expect(remaining).toHaveLength(2) // learning/review 的留下
  })

  it('加入→移除→再次加入：不重复入库（移除走 hardDelete，不进回收站）', () => {
    const n = addWordbookToPlan('ielts-daily')
    expect(n).toBeGreaterThan(0)
    // 移除：new 词被硬删（不进 trash），learning/review 不存在故全删
    expect(removeWordbookFromPlan('ielts-daily')).toBe(n)
    // trash 不含这些词（hardDelete 不进回收站，避免重加时 inLib 盲区导致重复）
    expect(listTrash().filter((e) => e.item.book === 'ielts-daily')).toHaveLength(0)
    // 再次加入：vocab 里该书词只有一份，无重复副本
    expect(addWordbookToPlan('ielts-daily')).toBe(n)
    const inLib = listVocab().filter((v) => v.book === 'ielts-daily')
    expect(inLib).toHaveLength(n)
    const ids = inLib.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length) // id 唯一
  })

  it('移除不存在的词书返回 0，不影响其它词', () => {
    addVocab({ word: 'x', meaning: 'm', example: 'e', topic: null, source: '手动' })
    expect(removeWordbookFromPlan('no-such-book')).toBe(0)
    expect(listVocab()).toHaveLength(1)
  })
})
