import { describe, it, expect } from 'vitest'
import { pickBoostWords, matchUsedWords } from '../src/main/polish-match'

// A1 背词联动的两个纯函数：
//   pickBoostWords —— 软引导选词（≤n、输入句已含词根的优先、不整库塞）
//   matchUsedWords —— 后验高亮（词形容忍：accommodate 命中 accommodating/accommodation）

describe('pickBoostWords —— 软引导选词', () => {
  it('空候选：返回空', () => {
    expect(pickBoostWords('any sentence', [])).toEqual([])
  })

  it('候选 ≤ n：全返回', () => {
    expect(pickBoostWords('hello world', ['apple', 'banana'], 8)).toEqual(['apple', 'banana'])
  })

  it('超过 n：截到 n 个', () => {
    const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    expect(pickBoostWords('zzz', words, 8)).toHaveLength(8)
  })

  it('输入句已含词干的词排最前（优先顺势优化）', () => {
    // 'accommodate' 词干命中输入里的 'accommodating' → 排第一，其余按原序补
    const out = pickBoostWords('I am accommodating the schedule', ['zebra', 'accommodate', 'apple'], 8)
    expect(out[0]).toBe('accommodate')
    expect(out).toContain('zebra')
    expect(out).toContain('apple')
  })

  it('n=0：返回空（上限防御）', () => {
    expect(pickBoostWords('hello', ['apple'], 0)).toEqual([])
  })
})

describe('matchUsedWords —— 后验高亮匹配', () => {
  it('整词精确命中', () => {
    expect(matchUsedWords('We leverage data daily.', ['leverage'])).toEqual(['leverage'])
  })

  it('词形变化命中：ing', () => {
    expect(matchUsedWords('I am accommodating them.', ['accommodate'])).toEqual(['accommodate'])
  })

  it('词形变化命中：复数 s / 过去式 ed', () => {
    expect(matchUsedWords('She studies hard and achieved much.', ['study', 'achieve'])).toEqual([
      'study',
      'achieve',
    ])
  })

  it('未出现的词不命中', () => {
    expect(matchUsedWords('The cat sat.', ['leverage', 'accommodate'])).toEqual([])
  })

  it('多词命中：全部返回且去重', () => {
    const out = matchUsedWords('Leverage tools to leverage outcomes.', ['leverage', 'leverage', 'tools'])
    expect(out).toEqual(['leverage', 'tools'])
  })

  it('大小写不敏感', () => {
    expect(matchUsedWords('ACCOMMODATE this.', ['accommodate'])).toEqual(['accommodate'])
  })

  it('空文本 / 空词表：空', () => {
    expect(matchUsedWords('', ['a'])).toEqual([])
    expect(matchUsedWords('text', [])).toEqual([])
  })

  it('超短词（<3 字母词干）退化为整词匹配，不误命中', () => {
    // 'as' 不应因为 'has'/'ask' 里含 as 而误命中；只在作为独立词出现时命中
    expect(matchUsedWords('Do it as planned.', ['as'])).toEqual(['as'])
    expect(matchUsedWords('He has it.', ['as'])).toEqual([])
  })
})
