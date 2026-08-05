import { describe, it, expect, beforeEach } from 'vitest'
import { addVocab, listVocab } from '../src/main/vocab'
import { _resetStoreForTests } from '../src/main/store'
import { migrateSensesFromWordbooks } from '../src/main/wordbook'

// 一词多义迁移：词书 AI 翻新后，已入库的词书词（book!=null）补 senses + 刷新 meaning。
// books 参数注入合成词书，不读真实 data/wordbooks（避免测试依赖数据文件）。

const BOOKS = [{
  id: 'b1', name: 'B1', desc: '',
  words: [
    {
      word: 'access', meaning: 'n. 通道；入口', example: 'e', topic: 't',
      senses: [
        { pos: 'n.', meaning: '通道；入口' },
        { pos: 'v.', meaning: '存取；访问' },
      ],
    },
    { word: 'plain', meaning: 'adj. 简单的', example: 'e', topic: 't' }, // 未翻新（无 senses）
  ],
}]

describe('migrateSensesFromWordbooks 一词多义迁移', () => {
  beforeEach(() => _resetStoreForTests())

  it('词书词补 senses + 刷新 meaning 为词书新版', () => {
    addVocab({ word: 'access', meaning: '旧义', example: 'e', topic: null, source: '词书', book: 'b1', status: 'new' })
    const n = migrateSensesFromWordbooks(BOOKS)
    expect(n).toBe(1)
    const v = listVocab().find((x) => x.word === 'access')!
    expect(v.senses).toHaveLength(2)
    expect(v.senses![1].pos).toBe('v.')
    expect(v.meaning).toBe('n. 通道；入口') // 刷新为词书翻新后的默认义项
  })

  it('手动词（book=null）不动——无词书 backing', () => {
    addVocab({ word: 'access', meaning: '旧义', example: 'e', topic: null, source: '手动' })
    expect(migrateSensesFromWordbooks(BOOKS)).toBe(0)
    expect(listVocab()[0].senses).toBeUndefined()
    expect(listVocab()[0].meaning).toBe('旧义')
  })

  it('词书词匹配到但未翻新（无 senses）→ 跳过', () => {
    addVocab({ word: 'plain', meaning: '旧义', example: 'e', topic: null, source: '词书', book: 'b1', status: 'new' })
    expect(migrateSensesFromWordbooks(BOOKS)).toBe(0)
    expect(listVocab()[0].senses).toBeUndefined()
  })

  it('幂等：已有 senses 的词不再动', () => {
    addVocab({
      word: 'access', meaning: '自定义', example: 'e', topic: null, source: '词书', book: 'b1', status: 'new',
      senses: [{ pos: 'n.', meaning: '自定义义项' }],
    })
    expect(migrateSensesFromWordbooks(BOOKS)).toBe(0)
    expect(listVocab()[0].senses).toEqual([{ pos: 'n.', meaning: '自定义义项' }])
    expect(listVocab()[0].meaning).toBe('自定义')
  })

  it('词匹配归一化（大小写/空格差异也能补上）', () => {
    addVocab({ word: ' Access ', meaning: '旧义', example: 'e', topic: null, source: '词书', book: 'b1', status: 'new' })
    expect(migrateSensesFromWordbooks(BOOKS)).toBe(1)
    expect(listVocab()[0].senses).toHaveLength(2)
  })
})
