import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests, getSrsState, peekNextId } from '../src/main/store'
import {
  listWordbooks, getWordbookWords, addWordsToPlan, addWordbookToPlan,
} from '../src/main/wordbook'
import { listVocab, addVocab, addVocabBatch, deleteVocab } from '../src/main/vocab'

describe('词书批量勾选加入', () => {
  beforeEach(() => _resetStoreForTests())

  it('getWordbookWords 返回词 + 是否在库标记（初始全不在库）', () => {
    const words = getWordbookWords('ielts-daily')
    expect(words.length).toBeGreaterThan(0)
    expect(words.every((w) => w.inLibrary === false)).toBe(true)
    expect(words[0].word).toBeTruthy()
    expect(words[0].meaning).toBeTruthy()
  })

  it('已在库的词被标记 inLibrary=true', () => {
    const first = getWordbookWords('ielts-daily')[0]
    addWordsToPlan('ielts-daily', [first.word])
    const words = getWordbookWords('ielts-daily')
    expect(words.find((w) => w.word === first.word)!.inLibrary).toBe(true)
  })

  it('addWordsToPlan 只加所选词，status=new、book=词书id', () => {
    const picked = getWordbookWords('ielts-daily').slice(0, 3).map((w) => w.word)
    const n = addWordsToPlan('ielts-daily', picked)
    expect(n).toBe(3)
    const inLib = listVocab().filter((v) => v.book === 'ielts-daily')
    expect(inLib).toHaveLength(3)
    expect(inLib.every((v) => v.status === 'new')).toBe(true)
  })

  it('addWordsToPlan 跳过已在库的（去重）', () => {
    const w = getWordbookWords('ielts-daily')[0].word
    addWordsToPlan('ielts-daily', [w])
    expect(addWordsToPlan('ielts-daily', [w])).toBe(0) // 重复加→0
    expect(listVocab().filter((v) => v.word === w)).toHaveLength(1)
  })

  it('getWordbookWords 对不存在的书返回空数组', () => {
    expect(getWordbookWords('no-such')).toEqual([])
  })

  it('回收站里的词被标 inTrash=true 且 inLibrary=false（引导前端禁选 + rose 徽标）', () => {
    // 取 ielts-daily 第一个词，手动加入后软删进回收站
    const first = getWordbookWords('ielts-daily')[0]
    const v = addVocab({ word: first.word, meaning: 'm', example: 'e', topic: null, source: '手动' })
    deleteVocab(v.id)
    const words = getWordbookWords('ielts-daily')
    const w = words.find((x) => x.word === first.word)!
    expect(w.inTrash).toBe(true)
    expect(w.inLibrary).toBe(false) // 不在 vocab，已在 trash
  })

  it('inLibrary 改扫全库（不限同书）：在其它书/手动加入的同词也被标 inLibrary=true', () => {
    // 修复"同书盲区"：原来只扫同书 vocab，会让已在其它书的同词误显示为可加入，但 addVocab 实际会拦
    const first = getWordbookWords('ielts-daily')[0]
    addVocab({ word: first.word, meaning: 'm', example: 'e', topic: null, source: '手动' }) // 手动加入，book=null
    const words = getWordbookWords('ielts-daily')
    const w = words.find((x) => x.word === first.word)!
    expect(w.inLibrary).toBe(true) // 跨书识别（手动词也算）
    expect(w.inTrash).toBe(false)
  })

  it('addWordsToPlan 跳过回收站里的词（与 getWordbookWords 标记一致，避免无谓抛错）', () => {
    const first = getWordbookWords('ielts-daily')[0]
    const v = addVocab({ word: first.word, meaning: 'm', example: 'e', topic: null, source: '手动' })
    deleteVocab(v.id) // 进回收站
    const another = getWordbookWords('ielts-daily')[1].word
    const n = addWordsToPlan('ielts-daily', [first.word, another])
    expect(n).toBe(1) // 回收站那条跳过，只加 another
    expect(listVocab().filter((v) => v.word === first.word)).toHaveLength(0) // 回收站原词未被覆盖
  })
})

// addVocabBatch：批量导入的性能优化实现（内存组装 + 三次写盘），语义与 addVocab 一致
describe('addVocabBatch 批量添加', () => {
  beforeEach(() => _resetStoreForTests())

  const entry = (word: string) => ({ word, meaning: 'm', example: 'e', topic: null, source: 's' })

  it('批量加 N 词：全入库、status 默认 learning、各配 srsState', () => {
    const n = addVocabBatch([entry('a'), entry('b'), entry('c')])
    expect(n).toBe(3)
    expect(listVocab()).toHaveLength(3)
    expect(listVocab().every((v) => v.status === 'learning')).toBe(true)
    for (const v of listVocab()) expect(getSrsState(v.id)).toBeTruthy()
  })

  it('库内查重：已在生词库的词跳过，返回实际加入数', () => {
    addVocab(entry('dup'))
    const n = addVocabBatch([entry('dup'), entry('fresh')])
    expect(n).toBe(1)
    expect(listVocab().filter((v) => v.word === 'dup')).toHaveLength(1) // 未重复
  })

  it('回收站查重：在回收站的词跳过', () => {
    const v = addVocab(entry('trashee'))
    deleteVocab(v.id) // 进回收站
    const n = addVocabBatch([entry('trashee'), entry('ok')])
    expect(n).toBe(1)
    expect(listVocab().filter((x) => x.word === 'trashee')).toHaveLength(0)
  })

  it('批内查重：同一批里的重复词只入一次', () => {
    const n = addVocabBatch([entry('same'), entry('same'), entry('SAME ')]) // 大小写/空格归一化后同源
    expect(n).toBe(1)
    expect(listVocab()).toHaveLength(1)
  })

  it('id 连续分配且无浪费：nextId 只推进实际加入的条数', () => {
    addVocab(entry('exist'))
    const before = peekNextId()
    addVocabBatch([entry('exist'), entry('x1'), entry('x2')]) // exist 撞库跳过，只加 2 个
    expect(peekNextId()).toBe(before + 2) // 跳过的不占 id
    const ids = listVocab().map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length) // id 唯一
  })

  it('全撞库时返回 0 且不写 vocab', () => {
    addVocab(entry('only'))
    const n = addVocabBatch([entry('only')])
    expect(n).toBe(0)
    expect(listVocab()).toHaveLength(1)
  })

  it('空批次返回 0', () => {
    expect(addVocabBatch([])).toBe(0)
  })

  it('透传一词多义增量字段（senses/selectedSenses 随入库保留）', () => {
    const n = addVocabBatch([{
      word: 'access', meaning: 'n. 通道；入口', example: 'e', topic: null, source: 't',
      senses: [
        { pos: 'n.', meaning: '通道；入口' },
        { pos: 'n.', meaning: '使用权；接触机会' },
        { pos: 'v.', meaning: '存取；访问' },
      ],
      selectedSenses: [0, 2],
    }])
    expect(n).toBe(1)
    const v = listVocab().find((x) => x.word === 'access')!
    expect(v.senses).toHaveLength(3)
    expect(v.senses![2].pos).toBe('v.')
    expect(v.selectedSenses).toEqual([0, 2])
  })
})
