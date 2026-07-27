import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests } from '../src/main/store'
import {
  getSetting, setSetting, getAllSettings, DEFAULT_SETTINGS,
  ELASTIC_KEYS, resetElasticSettings,
} from '../src/main/settings'

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

  it('默认值：含 pass_count/theme/font_size，已移除 recall_delay_sec', () => {
    expect(DEFAULT_SETTINGS.pass_count).toBe('3')
    expect(DEFAULT_SETTINGS.theme).toBe('emerald')
    expect(DEFAULT_SETTINGS.font_size).toBe('16') // 连续 px（滑块缩放），兼容旧档 id 见 theme.getFontSize
    expect(DEFAULT_SETTINGS).not.toHaveProperty('recall_delay_sec')
  })

  it('resetElasticSettings：先改乱再重置，弹性键全部回默认，其余键不动', () => {
    for (const k of ELASTIC_KEYS) setSetting(k, '999')
    setSetting('theme', 'rose') // 非弹性键，不应被重置
    resetElasticSettings()
    for (const k of ELASTIC_KEYS) {
      expect(getSetting(k)).toBe(DEFAULT_SETTINGS[k])
    }
    expect(getSetting('theme')).toBe('rose')
  })
})
