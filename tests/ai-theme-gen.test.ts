import { describe, it, expect } from 'vitest'
import { clampGenCount, themeGenMaxTokens, buildThemeGenPrompt } from '../src/main/ai'

// 主题生成：单词/词组模式 + 生成数量（设计稿 design/v1.6.1-主题生成单词词组模式.md）
// 纯函数接缝：数量收敛 / maxTokens 分档 / prompt 组装。
// 硬约束：phrase 模式的 prompt 输出与现状逐字节一致（词组模式行为零变化）。

describe('clampGenCount —— 生成数量收敛到 1–50', () => {
  it('合法值原样通过', () => {
    expect(clampGenCount(1)).toBe(1)
    expect(clampGenCount(30)).toBe(30)
    expect(clampGenCount(50)).toBe(50)
  })

  it('超界收敛：小于 1 → 1，大于 50 → 50', () => {
    expect(clampGenCount(0)).toBe(1)
    expect(clampGenCount(-5)).toBe(1)
    expect(clampGenCount(51)).toBe(50)
    expect(clampGenCount(100)).toBe(50)
  })

  it('非法输入（NaN/undefined/非数字字符串）→ 默认 30', () => {
    expect(clampGenCount(NaN)).toBe(30)
    expect(clampGenCount(undefined)).toBe(30)
    expect(clampGenCount('abc')).toBe(30)
  })

  it('数字字符串可解析（设置存储是字符串）', () => {
    expect(clampGenCount('20')).toBe(20)
  })

  it('小数取整', () => {
    expect(clampGenCount(12.7)).toBe(13)
  })
})

describe('themeGenMaxTokens —— maxTokens 随数量分档', () => {
  it('n≤30 → 8000（现状不变）', () => {
    expect(themeGenMaxTokens(1)).toBe(8000)
    expect(themeGenMaxTokens(30)).toBe(8000)
  })

  it('31–50 → 16000（大批量放大）', () => {
    expect(themeGenMaxTokens(31)).toBe(16000)
    expect(themeGenMaxTokens(50)).toBe(16000)
  })
})

describe('buildThemeGenPrompt —— 按模式组装 system/user', () => {
  it('word 模式：system 要求单个词并明令禁止词组', () => {
    const { system } = buildThemeGenPrompt('word', '科技', 30)
    expect(system).toContain('单个英文单词')
    expect(system).toContain('严禁')
  })

  it('word 模式：user 文案指明生成单词（单个词，不要词组）', () => {
    const { user } = buildThemeGenPrompt('word', '科技', 20)
    expect(user).toContain('科技')
    expect(user).toContain('20')
    expect(user).toContain('单词')
    expect(user).not.toContain('词组。') // 不以词组收尾（词组模式的文案）
  })

  it('phrase 模式：与现状文案逐字节一致（兼容锁）', () => {
    const { system, user } = buildThemeGenPrompt('phrase', '教育', 30)
    expect(system).toContain('高频学术词组')
    expect(user).toBe('主题：「教育」。生成 30 个雅思高频词组。')
  })
})
