import { describe, it, expect, vi } from 'vitest'

// updater.ts 顶层 import electron / electron-updater / settings（间接 electron-store）。
// 测试只验纯函数（版本比对 / releaseNotes 规整 / 首启判定），不触碰这些运行时，整体 mock 掉。
vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '1.6.0'), isPackaged: false },
}))
vi.mock('electron-updater', () => ({
  autoUpdater: {
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}))
vi.mock('../src/main/settings', () => ({
  getSetting: vi.fn(() => null),
  setSetting: vi.fn(),
}))

import { compareVersions, normalizeReleaseNotes, shouldShowChangelog } from '../src/main/updater'

describe('updater 纯函数', () => {
  describe('compareVersions', () => {
    it('a > b → 1', () => {
      expect(compareVersions('1.6.0', '1.5.0')).toBe(1)
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    })
    it('a < b → -1', () => {
      expect(compareVersions('1.5.0', '1.6.0')).toBe(-1)
    })
    it('相等 → 0（位数不齐补 0）', () => {
      expect(compareVersions('1.6.0', '1.6.0')).toBe(0)
      expect(compareVersions('1.6', '1.6.0')).toBe(0)
    })
    it('非法段按 0 处理', () => {
      expect(compareVersions('1.x.0', '1.0.0')).toBe(0)
    })
  })

  describe('normalizeReleaseNotes', () => {
    it('字符串原样返回', () => {
      expect(normalizeReleaseNotes('新增 A\n修复 B')).toBe('新增 A\n修复 B')
    })
    it('null/undefined → 空串', () => {
      expect(normalizeReleaseNotes(null)).toBe('')
      expect(normalizeReleaseNotes(undefined)).toBe('')
    })
    it('{note}[] 数组拼接 note', () => {
      expect(normalizeReleaseNotes([{ note: '甲' }, { note: '乙' }])).toBe('甲\n\n乙')
    })
    it('数组里空 note 被过滤', () => {
      expect(normalizeReleaseNotes([{ note: '甲' }, { note: '' }])).toBe('甲')
    })
  })

  describe('shouldShowChangelog（首启日志「不反复显示」判定）', () => {
    it('当前版本 > 已读版本 → 弹', () => {
      expect(shouldShowChangelog('1.6.0', '1.5.0')).toBe(true)
    })
    it('当前版本 === 已读版本 → 不弹（已读过）', () => {
      expect(shouldShowChangelog('1.6.0', '1.6.0')).toBe(false)
    })
    it('已读版本为空（首次安装）→ 不弹（没用过旧版，无"更新"概念）', () => {
      expect(shouldShowChangelog('1.6.0', '')).toBe(false)
    })
    it('当前版本为空 → 不弹', () => {
      expect(shouldShowChangelog('', '1.5.0')).toBe(false)
    })
    it('当前版本 < 已读版本（异常回退）→ 不弹', () => {
      expect(shouldShowChangelog('1.5.0', '1.6.0')).toBe(false)
    })
  })
})
