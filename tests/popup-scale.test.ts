import { describe, it, expect } from 'vitest'
import {
  getPopupScale,
  POPUP_SCALE_MIN,
  POPUP_SCALE_MAX,
  POPUP_SCALE_DEFAULT,
  getPopupOpacity,
  POPUP_OPACITY_MIN,
  POPUP_OPACITY_MAX,
  POPUP_OPACITY_DEFAULT,
} from '../src/renderer/theme'

describe('popup scale', () => {
  it('常量范围 0.8–1.5，默认 1.0', () => {
    expect(POPUP_SCALE_MIN).toBe(0.8)
    expect(POPUP_SCALE_MAX).toBe(1.5)
    expect(POPUP_SCALE_DEFAULT).toBe(1.0)
  })

  it('正常值原样返回（字符串数字）', () => {
    expect(getPopupScale('1.0')).toBe('1')
    expect(getPopupScale('1.5')).toBe('1.5')
    expect(getPopupScale('0.8')).toBe('0.8')
    expect(getPopupScale('1.23')).toBe('1.23')
  })

  it('空值/undefined 兜底回默认 1', () => {
    expect(getPopupScale(undefined)).toBe('1')
    expect(getPopupScale('')).toBe('1')
    expect(getPopupScale(null)).toBe('1')
  })

  it('非法字符串兜底回默认 1', () => {
    expect(getPopupScale('abc')).toBe('1')
  })

  it('超范围 clamp 到边界', () => {
    expect(getPopupScale('3')).toBe('1.5')
    expect(getPopupScale('0.1')).toBe('0.8')
  })
})

describe('popup opacity', () => {
  it('常量范围 0.5–1.0，默认 1.0', () => {
    expect(POPUP_OPACITY_MIN).toBe(0.5)
    expect(POPUP_OPACITY_MAX).toBe(1.0)
    expect(POPUP_OPACITY_DEFAULT).toBe(1.0)
  })

  it('正常值原样返回（字符串数字）', () => {
    expect(getPopupOpacity('1.0')).toBe('1')
    expect(getPopupOpacity('0.5')).toBe('0.5')
    expect(getPopupOpacity('0.75')).toBe('0.75')
  })

  it('空值/undefined 兜底回默认 1', () => {
    expect(getPopupOpacity(undefined)).toBe('1')
    expect(getPopupOpacity('')).toBe('1')
    expect(getPopupOpacity(null)).toBe('1')
  })

  it('非法字符串兜底回默认 1', () => {
    expect(getPopupOpacity('abc')).toBe('1')
  })

  it('超范围 clamp 到边界（下界 0.5，上界 1）', () => {
    expect(getPopupOpacity('0.1')).toBe('0.5')
    expect(getPopupOpacity('2')).toBe('1')
  })
})
