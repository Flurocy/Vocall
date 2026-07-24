import { describe, it, expect } from 'vitest'
import { THEMES, getTheme, getFontSize, FONT_SIZE_OPTIONS } from '../src/renderer/theme'

describe('theme', () => {
  it('五个主题 id 齐全，emerald 为默认', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['emerald', 'sky', 'violet', 'amber', 'rose'])
    expect(getTheme().id).toBe('emerald')
  })

  it('按 id 取主题', () => {
    expect(getTheme('sky').id).toBe('sky')
    expect(getTheme('rose').accentText).toBe('text-rose-700')
  })

  it('空值/未知 id 兜底回默认 emerald', () => {
    expect(getTheme(undefined).id).toBe('emerald')
    expect(getTheme('').id).toBe('emerald')
    expect(getTheme('not-a-theme').id).toBe('emerald')
  })

  it('每个主题的类名都是完整字面量（Tailwind JIT 可扫描）', () => {
    for (const t of THEMES) {
      // 类名不得含拼接残留或空串
      for (const cls of [t.bgApp, t.bgCard, t.accentText, t.accentBg, t.accentBgHover, t.accentSolid, t.accentSolidHover, t.swatch, t.accentColor]) {
        expect(cls.length).toBeGreaterThan(0)
        expect(cls).not.toContain('undefined')
      }
    }
  })
})

describe('font size', () => {
  it('三档齐全 sm/md/lg', () => {
    expect(FONT_SIZE_OPTIONS.map((o) => o.id)).toEqual(['sm', 'md', 'lg'])
    expect(getFontSize('sm')).toBe('14px')
    expect(getFontSize('md')).toBe('16px')
    expect(getFontSize('lg')).toBe('18px')
  })

  it('空值/未知档兜底回 md', () => {
    expect(getFontSize(undefined)).toBe('16px')
    expect(getFontSize('')).toBe('16px')
    expect(getFontSize('xxl')).toBe('16px')
  })
})
