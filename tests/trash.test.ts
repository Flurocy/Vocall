import { describe, it, expect, beforeEach } from 'vitest'
import {
  addVocab, deleteVocab, listVocab, listTrash, restoreVocab, purgeVocab, clearTrash,
} from '../src/main/vocab'
import { getSrsState, setSrsState, trashBox, _resetStoreForTests } from '../src/main/store'

// 造一个 learning 词并给齐 SRS 四字段（addVocab 默认 new，这里显式提升并补非默认 srs 值方便比对还原）
function make(word = `w${Math.random()}`): ReturnType<typeof addVocab> {
  const v = addVocab({ word, meaning: 'm', example: 'e', topic: null, source: 's' })
  setSrsState(v.id, { easiness: 2.6, repetitions: 1, duePop: 7, forgotCount: 2 })
  return v
}

describe('回收站（软删除 + 还原 + 清空）', () => {
  beforeEach(() => _resetStoreForTests())

  it('deleteVocab：词从 vocab 消失、进 trash（带 deletedAt）、srsState 保留', () => {
    const v = make()
    deleteVocab(v.id)
    expect(listVocab().find((x) => x.id === v.id)).toBeUndefined()
    const trash = listTrash()
    expect(trash).toHaveLength(1)
    expect(trash[0].item.id).toBe(v.id)
    expect(typeof trash[0].deletedAt).toBe('number')
    expect(trash[0].deletedAt).toBeGreaterThan(0)
    // srsState 仍在（软删除保留供还原）
    expect(getSrsState(v.id)).toBeDefined()
  })

  it('listTrash：按 deletedAt 倒序（最近删在上）', () => {
    const a = make('a'); const b = make('b'); const c = make('c')
    // 直接注入带不同时间戳的包装，模拟不同时刻删除
    trashBox.set([
      { item: a, deletedAt: 100 },
      { item: b, deletedAt: 300 },
      { item: c, deletedAt: 200 },
    ])
    expect(listTrash().map((e) => e.item.word)).toEqual(['b', 'c', 'a'])
  })

  it('restoreVocab：词回 vocab（内容完整）、trash 移除、srs 完全保持', () => {
    const v = make()
    const srsBefore = getSrsState(v.id)!
    deleteVocab(v.id)
    restoreVocab(v.id)
    expect(listVocab().find((x) => x.id === v.id)).toEqual(v) // 内容完整、status 保持
    expect(listTrash().find((e) => e.item.id === v.id)).toBeUndefined()
    expect(getSrsState(v.id)).toEqual(srsBefore) // srs 还原前后一致
  })

  it('purgeVocab：trash 真删 + srsState 删', () => {
    const v = make()
    deleteVocab(v.id)
    purgeVocab(v.id)
    expect(listTrash()).toHaveLength(0)
    expect(getSrsState(v.id)).toBeUndefined()
  })

  it('clearTrash：全清 + 所有 trash 词的 srsState 删', () => {
    const a = make('a'); const b = make('b')
    deleteVocab(a.id); deleteVocab(b.id)
    clearTrash()
    expect(listTrash()).toHaveLength(0)
    expect(getSrsState(a.id)).toBeUndefined()
    expect(getSrsState(b.id)).toBeUndefined()
  })

  it('clearTrash：不误删仍留在 vocab 的词的 srsState', () => {
    const a = make('a'); const b = make('b')
    deleteVocab(a.id) // a 进 trash，b 仍在 vocab
    clearTrash()
    expect(getSrsState(b.id)).toBeDefined() // b 的 srs 必须还在（清空只针对 trash）
  })

  it('边界：restoreVocab/purgeVocab 不存在的 id → no-op 不崩', () => {
    expect(() => restoreVocab(9999)).not.toThrow()
    expect(() => purgeVocab(9999)).not.toThrow()
    expect(listTrash()).toHaveLength(0)
  })

  it('边界：clearTrash 空回收站 → no-op 不崩', () => {
    expect(() => clearTrash()).not.toThrow()
    expect(listTrash()).toHaveLength(0)
  })
})
