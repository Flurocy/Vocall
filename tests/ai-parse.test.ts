import { describe, it, expect } from 'vitest'
import { parseVocabArray, parseVocabObject } from '../src/main/ai'

// 纯函数测试：JSON 容错解析（AI 返回可能裹 markdown code block、可能截断、字段不全）
// 这些函数是 AI 内容生产链路的"防御层"，必须严格校验以避免脏数据进词汇库。

describe('parseVocabArray —— 解析 [{word,meaning,example}]', () => {
  it('正常 JSON 数组：原样返回', () => {
    const text = JSON.stringify([
      { word: 'leverage', meaning: 'v. 利用', example: 'We leverage data to drive decisions.' },
      { word: 'curriculum', meaning: 'n. 课程体系', example: 'The school updated its curriculum.' },
    ])
    const out = parseVocabArray(text)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      word: 'leverage', meaning: 'v. 利用',
      example: 'We leverage data to drive decisions.',
    })
  })

  it('带 ```json ... ``` code block：strip 后解析', () => {
    const text = '```json\n[{"word":"a","meaning":"甲","example":"A is a letter."}]\n```'
    const out = parseVocabArray(text)
    expect(out).toEqual([{ word: 'a', meaning: '甲', example: 'A is a letter.' }])
  })

  it('带裸 ``` code block（无 json 标记）：strip 后解析', () => {
    const text = '```\n[{"word":"x","meaning":"y","example":"z"}]\n```'
    const out = parseVocabArray(text)
    expect(out).toEqual([{ word: 'x', meaning: 'y', example: 'z' }])
  })

  it('AI 输出有前后杂音文字（前后缀包裹 JSON）：解析出中间数组', () => {
    const text = '好的，这是结果：\n[{"word":"a","meaning":"甲","example":"aa"}]\n以上是 30 个词组。'
    const out = parseVocabArray(text)
    expect(out).toEqual([{ word: 'a', meaning: '甲', example: 'aa' }])
  })

  it('缺 example 字段：抛', () => {
    const text = JSON.stringify([{ word: 'a', meaning: '甲' }])
    expect(() => parseVocabArray(text)).toThrow()
  })

  it('缺 word 字段：抛', () => {
    const text = JSON.stringify([{ meaning: '甲', example: 'aa' }])
    expect(() => parseVocabArray(text)).toThrow()
  })

  it('字段为空字符串：抛（非空校验）', () => {
    const text = JSON.stringify([{ word: '', meaning: '甲', example: 'aa' }])
    expect(() => parseVocabArray(text)).toThrow()
  })

  it('字段类型错（word 是数字）：抛', () => {
    const text = JSON.stringify([{ word: 1, meaning: '甲', example: 'aa' }])
    expect(() => parseVocabArray(text)).toThrow()
  })

  it('非法 JSON（截断的数组）：抛', () => {
    const text = '[{"word":"a","meaning":"甲"'
    expect(() => parseVocabArray(text)).toThrow()
  })

  it('JSON 但非数组（对象）：抛', () => {
    const text = JSON.stringify({ word: 'a', meaning: '甲', example: 'aa' })
    expect(() => parseVocabArray(text)).toThrow()
  })

  it('空字符串：抛', () => {
    expect(() => parseVocabArray('')).toThrow()
  })
})

describe('parseVocabObject —— 解析 {meaning,example}', () => {
  it('正常 JSON 对象：原样返回', () => {
    const text = JSON.stringify({ meaning: 'v. 利用', example: 'We leverage tools.' })
    const out = parseVocabObject(text)
    expect(out).toEqual({ meaning: 'v. 利用', example: 'We leverage tools.' })
  })

  it('带 ```json ... ``` code block：strip 后解析', () => {
    const text = '```json\n{"meaning":"甲","example":"A is a."}\n```'
    const out = parseVocabObject(text)
    expect(out).toEqual({ meaning: '甲', example: 'A is a.' })
  })

  it('带裸 ``` code block：strip 后解析', () => {
    const text = '```\n{"meaning":"y","example":"z"}\n```'
    const out = parseVocabObject(text)
    expect(out).toEqual({ meaning: 'y', example: 'z' })
  })

  it('AI 输出有前后杂音文字：解析出中间对象', () => {
    const text = '释义如下：\n{"meaning":"甲","example":"aa"}\n完毕。'
    const out = parseVocabObject(text)
    expect(out).toEqual({ meaning: '甲', example: 'aa' })
  })

  it('缺 example 字段：抛', () => {
    const text = JSON.stringify({ meaning: '甲' })
    expect(() => parseVocabObject(text)).toThrow()
  })

  it('缺 meaning 字段：抛', () => {
    const text = JSON.stringify({ example: 'aa' })
    expect(() => parseVocabObject(text)).toThrow()
  })

  it('字段为空字符串：抛', () => {
    const text = JSON.stringify({ meaning: '', example: 'aa' })
    expect(() => parseVocabObject(text)).toThrow()
  })

  it('字段类型错（meaning 是数字）：抛', () => {
    const text = JSON.stringify({ meaning: 1, example: 'aa' })
    expect(() => parseVocabObject(text)).toThrow()
  })

  it('非法 JSON：抛', () => {
    const text = '{"meaning":"甲"'
    expect(() => parseVocabObject(text)).toThrow()
  })

  it('JSON 但非对象（数组）：抛', () => {
    const text = JSON.stringify([{ meaning: '甲', example: 'aa' }])
    expect(() => parseVocabObject(text)).toThrow()
  })

  it('空字符串：抛', () => {
    expect(() => parseVocabObject('')).toThrow()
  })
})
