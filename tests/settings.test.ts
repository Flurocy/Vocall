import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests } from '../src/main/store'
import { getSetting, setSetting, getAllSettings, DEFAULT_SETTINGS } from '../src/main/settings'

describe('settings', () => {
  beforeEach(() => {
    _resetStoreForTests()
  })

  it('未设置时返回默认值', () => {
    expect(getSetting('popup_interval_min')).toBe(DEFAULT_SETTINGS.popup_interval_min)
  })

  it('写入后可读取，且覆盖默认值', () => {
    setSetting('popup_interval_min', '10')
    expect(getSetting('popup_interval_min')).toBe('10')
  })

  it('getAllSettings 合并默认值与已存值', () => {
    setSetting('sound_enabled', 'false')
    const all = getAllSettings()
    expect(all.sound_enabled).toBe('false')
    expect(all.popup_position).toBe(DEFAULT_SETTINGS.popup_position)
  })
})
