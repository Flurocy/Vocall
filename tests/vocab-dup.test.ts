import { describe, it, expect, beforeEach } from 'vitest'
import {
  addVocab, listVocab, deleteVocab, restoreVocab, purgeVocab, listTrash,
} from '../src/main/vocab'
import { _resetStoreForTests } from '../src/main/store'
import { seedIfEmpty } from '../src/main/seed'
import { addWordsToPlan } from '../src/main/wordbook'

// 同词导入拦截：addVocab 开头做归一化查重（生词库 + 回收站），命中抛错。
describe('vocab 同词导入拦截', () => {
  beforeEach(() => {
    _resetStoreForTests() // 用内存态重置，避免测试间互相污染
  })

  const entry = (word: string) => ({
    word, meaning: 'm', example: 'e', topic: null, source: '手动',
  })

  it('同词（同大小写）第二次添加抛错', () => {
    addVocab(entry('significant'))
    expect(() => addVocab(entry('significant'))).toThrow(/已在生词库/)
  })

  it('同词不同大小写抛错（归一化生效）', () => {
    addVocab(entry('significant'))
    expect(() => addVocab(entry('Significant'))).toThrow(/已在生词库/)
  })

  it('删除到回收站后再加同词仍抛错（含回收站查重）', () => {
    const a = addVocab(entry('significant'))
    deleteVocab(a.id) // 软删除进回收站
    expect(listVocab()).toHaveLength(0)
    expect(() => addVocab(entry('significant'))).toThrow(/已在生词库/)
  })

  it('回收站还原后该词仍在，再加同词仍抛错（还原不绕过查重）', () => {
    const a = addVocab(entry('significant'))
    deleteVocab(a.id)
    restoreVocab(a.id) // 从回收站还原回生词库
    expect(listVocab()).toHaveLength(1)
    expect(() => addVocab(entry('significant'))).toThrow(/已在生词库/)
  })

  it('不同词正常添加', () => {
    addVocab(entry('significant'))
    addVocab(entry('abandon'))
    expect(listVocab()).toHaveLength(2)
  })

  it('回收站彻底删除（purge）后再加同词成功（真删后释放）', () => {
    const a = addVocab(entry('significant'))
    deleteVocab(a.id)
    purgeVocab(a.id) // 从回收站真删，词名释放
    expect(() => addVocab(entry('significant'))).not.toThrow()
    expect(listVocab()).toHaveLength(1)
  })
})

// seed 兜底：回收站含种子词 + vocab 空时，seedIfEmpty 跳过撞词不抛错（防启动链炸断）
describe('seed 遇回收站撞词', () => {
  beforeEach(() => {
    _resetStoreForTests()
  })

  it('trash 含种子词 + vocab 空时 seedIfEmpty 不 throw，撞词跳过其余照常导入', () => {
    // curriculum 是 data/seed-vocab.json 里的种子词之一；软删进回收站模拟"全删后重启"
    const a = addVocab({
      word: 'curriculum', meaning: 'm', example: 'e', topic: null, source: '手动',
    })
    deleteVocab(a.id)
    expect(listVocab()).toHaveLength(0) // 守卫放行条件：vocab 空
    expect(() => seedIfEmpty()).not.toThrow()
    const all = listVocab()
    expect(all.length).toBeGreaterThan(0) // 其余种子词照常入库
    // 撞词的 curriculum 被跳过：vocab 里没有（回收站那条不还原、不重复入）
    expect(all.filter((e) => e.word === 'curriculum')).toHaveLength(0)
    expect(listTrash()).toHaveLength(1) // 回收站原样保留
  })
})

// 词书批量导入兜底：inLib 只过滤同书词，与用户手动词撞车时单条跳过不中断整批
describe('词书导入遇撞词', () => {
  beforeEach(() => {
    _resetStoreForTests()
  })

  it('addWordsToPlan 跳过与用户手动词撞车的词，其余正常入库，保留用户那条', () => {
    // significant 是 ielts-sample 词书里的词；用户已手动加过
    addVocab({
      word: 'significant', meaning: '手动释义', example: 'e', topic: null, source: '手动',
    })
    const n = addWordsToPlan('ielts-sample', ['significant', 'controversial'])
    expect(n).toBe(1) // 撞车的 significant 跳过，controversial 正常入
    const all = listVocab()
    expect(all).toHaveLength(2)
    const sig = all.find((e) => e.word === 'significant')!
    expect(sig.source).toBe('手动') // 保留用户那条，不被词书覆盖
    expect(sig.book).toBeNull()
    const con = all.find((e) => e.word === 'controversial')!
    expect(con.book).toBe('ielts-sample')
    expect(con.status).toBe('new')
  })
})
