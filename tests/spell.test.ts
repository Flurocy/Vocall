import { describe, it, expect } from 'vitest'
import { compareSpelling } from '../src/renderer/popup/spell'

// 反转回忆 包5 拼写校验（设计稿 v1.6.1 §3.4）：
// 逐字符对比用户输入 vs 目标词；忽略大小写 + trim，但不放宽编辑距离（拼错就是拼错）。
// 拼写仅作参考反馈（翻面绿/红渲染），评分权在用户（照常自评 0/1/2）。

describe('compareSpelling —— 逐字符拼写对比', () => {
  it('完全正确：correct=true，全绿', () => {
    const r = compareSpelling('spring', 'spring')
    expect(r.correct).toBe(true)
    expect(r.chars).toHaveLength(6)
    expect(r.chars.every((c) => c.ok)).toBe(true)
  })

  it('忽略大小写与首尾空白', () => {
    expect(compareSpelling('  Spring ', 'spring').correct).toBe(true)
    expect(compareSpelling('SPRING', 'spring').correct).toBe(true)
  })

  it('拼错字符标红：逐字符位置对比', () => {
    // sprang vs spring：index3 a≠i 错；index4 n=n 对；index5 g=g 对
    const r = compareSpelling('sprang', 'spring')
    expect(r.correct).toBe(false)
    expect(r.chars.map((c) => c.ok)).toEqual([true, true, true, false, true, true])
  })

  it('输入超长：超出目标长度的字符全部标错', () => {
    const r = compareSpelling('springs', 'spring')
    expect(r.correct).toBe(false)
    expect(r.chars).toHaveLength(7)
    expect(r.chars[6]).toEqual({ char: 's', ok: false })
  })

  it('输入不足长：correct=false，已有字符照常逐字标记', () => {
    const r = compareSpelling('spr', 'spring')
    expect(r.correct).toBe(false)
    expect(r.chars.map((c) => c.ok)).toEqual([true, true, true])
  })

  it('chars 保留用户输入的原样字符（大小写显示用输入的）', () => {
    const r = compareSpelling('Spring', 'spring')
    expect(r.chars[0]).toEqual({ char: 'S', ok: true })
  })

  it('空输入：correct=false，chars 为空', () => {
    const r = compareSpelling('   ', 'spring')
    expect(r.correct).toBe(false)
    expect(r.chars).toEqual([])
  })
})
