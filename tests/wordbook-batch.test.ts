import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests } from '../src/main/store'
import {
  listWordbooks, getWordbookWords, addWordsToPlan, addWordbookToPlan,
} from '../src/main/wordbook'
import { listVocab, addVocab } from '../src/main/vocab'

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
})
