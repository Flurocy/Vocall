import { describe, it, expect } from 'vitest'
import { accentToType, buildPronunciationUrl } from '../src/main/audio'

// 纯函数测试：有道 dictvoice URL 构造（accentToType / buildPronunciationUrl）。
// fetchPronunciation 本身需网络+有道真实响应，不单测，靠真机验证（断网/超时由 IPC handler 兜底）。

describe('accentToType —— 英/美音 → 有道 type 参数（1 英 / 2 美）', () => {
  it("british → 1", () => {
    expect(accentToType('british')).toBe(1)
  })
  it("american → 2", () => {
    expect(accentToType('american')).toBe(2)
  })
  it('空串 → 1（默认英音）', () => {
    expect(accentToType('')).toBe(1)
  })
  it('其他乱值 → 1（默认英音，非精确匹配 american 一律当英音）', () => {
    expect(accentToType('xyz')).toBe(1)
    // 大小写敏感：'American' ≠ 'american'，当默认英音
    expect(accentToType('American')).toBe(1)
    expect(accentToType('US')).toBe(1)
  })
})

describe('buildPronunciationUrl —— 有道 dictvoice URL 构造', () => {
  it('普通词 + 英音：audio=word, type=1', () => {
    expect(buildPronunciationUrl('hello', 'british'))
      .toBe('https://dict.youdao.com/dictvoice?audio=hello&type=1')
  })
  it('普通词 + 美音：type=2', () => {
    expect(buildPronunciationUrl('hello', 'american'))
      .toBe('https://dict.youdao.com/dictvoice?audio=hello&type=2')
  })
  it('含空格的词组：空格 encode 为 %20', () => {
    expect(buildPronunciationUrl('good morning', 'british'))
      .toBe('https://dict.youdao.com/dictvoice?audio=good%20morning&type=1')
  })
  it('含 & 特殊字符：encode 为 %26（防破坏 URL query）', () => {
    expect(buildPronunciationUrl('a&b', 'american'))
      .toBe('https://dict.youdao.com/dictvoice?audio=a%26b&type=2')
  })
  it('accent 空串 → type=1（默认英音）', () => {
    expect(buildPronunciationUrl('word', ''))
      .toBe('https://dict.youdao.com/dictvoice?audio=word&type=1')
  })
})
