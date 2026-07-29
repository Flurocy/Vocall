import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests } from '../src/main/store'
import {
  listWordbooks, getWordbookWords, addWordsToPlan, addWordbookToPlan,
} from '../src/main/wordbook'
import { listVocab, addVocab, deleteVocab } from '../src/main/vocab'

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
