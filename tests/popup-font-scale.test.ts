import { describe, it, expect } from 'vitest'
import {
  getPopupFontScale,
  POPUP_FONT_SCALE_MIN,
  POPUP_FONT_SCALE_MAX,
  POPUP_FONT_SCALE_DEFAULT,
} from '../src/renderer/theme'

describe('popup font scale（弹窗内容 zoom 倍率）', () => {
  it('常量范围 0.7–1.4，默认 1.0', () => {
    expect(POPUP_FONT_SCALE_MIN).toBe(0.7)
    expect(POPUP_FONT_SCALE_MAX).toBe(1.4)
    expect(POPUP_FONT_SCALE_DEFAULT).toBe(1.0)
  })

  it('正常值原样返回（字符串数字，保留精度）', () => {
    expect(getPopupFontScale('1.0')).toBe('1')
    expect(getPopupFontScale('1.25')).toBe('1.25')
    expect(getPopupFontScale('0.7')).toBe('0.7')
  })

  it('空值/undefined 兜底回默认 1', () => {
    expect(getPopupFontScale('')).toBe('1')
    expect(getPopupFontScale(undefined)).toBe('1')
    expect(getPopupFontScale(null)).toBe('1')
  })

  it('非法字符串兜底回默认 1', () => {
    expect(getPopupFontScale('abc')).toBe('1')
  })

  it('超范围 clamp 到边界（下界 0.7，上界 1.4）', () => {
    expect(getPopupFontScale('2')).toBe('1.4')
    expect(getPopupFontScale('0.1')).toBe('0.7')
  })
})
