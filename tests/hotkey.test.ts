import { describe, it, expect, beforeEach, vi } from 'vitest'

// hotkey.ts 模块级 `app.on('will-quit', ...)` + globalShortcut 调用：electron 在 Node 测试
// 环境下导出的是可执行文件路径字符串，app/globalShortcut 为 undefined 会 throw，
// 故整体 mock electron。register/unregister 的真实行为靠真机，单测不验证。
vi.mock('electron', () => ({
  app: { on: vi.fn() },
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
}))

// showPopup 触达 BrowserWindow.webContents 等 electron 运行时 API，mock 掉；
// 用 vi.mocked 取出 spy 做断言。
vi.mock('../src/main/popup', () => ({ showPopup: vi.fn() }))

import { addVocab, updateVocab, listVocab } from '../src/main/vocab'
import { setSrsState, _resetStoreForTests, getPopCount } from '../src/main/store'
import { showPopup } from '../src/main/popup'
import { pickPopupWord, popupNow } from '../src/main/hotkey'

const showPopupMock = vi.mocked(showPopup)

// 造一个指定 status 的词（addVocab 默认 new 统一队列，这里按需提升；SRS 四字段给齐）
function make(
  status: 'new' | 'learning' | 'review' | 'mastered',
  duePop = 0,
): ReturnType<typeof addVocab> {
  const v = addVocab({ word: `w${Math.random()}`, meaning: 'm', example: 'e', topic: null, source: 's' })
  updateVocab(v.id, { status })
  setSrsState(v.id, { easiness: 2.5, repetitions: 0, duePop, forgotCount: 0 })
  return v
}

describe('hotkey 主动唤出', () => {
  beforeEach(() => {
    _resetStoreForTests()
    showPopupMock.mockClear()
  })

  describe('pickPopupWord（选词纯函数：到期优先 → 否则 learning+review 随机）', () => {
    it('到期优先：有到期词时返回 getDueVocab 选中的那一条', () => {
      const due = make('learning', 0)
      make('learning', 9999) // 未到期
      make('review', 9999)   // 未到期
      expect(pickPopupWord()!.id).toBe(due.id)
    })

    it('无到期词时，随机选一定来自 learning+review，绝不含 new/mastered', () => {
      // 全部 duePop=9999 → 未到期 → getDueVocab 返回 null → 走随机分支
      const learning = [make('learning', 9999), make('learning', 9999)]
      const review = [make('review', 9999), make('review', 9999)]
      make('new', 9999); make('new', 9999)
      make('mastered', 9999); make('mastered', 9999)
      const allowed = new Set([...learning, ...review].map((v) => v.id))
      const banned = new Set(
        listVocab()
          .filter((v) => v.status === 'new' || v.status === 'mastered')
          .map((v) => v.id),
      )
      // 多次取样：纯函数无副作用，重复调以覆盖随机分布
      for (let i = 0; i < 50; i++) {
        const w = pickPopupWord()!
        expect(allowed.has(w.id)).toBe(true)
        expect(banned.has(w.id)).toBe(false)
      }
    })

    it('无 learning/review 候选（只有 new/mastered）→ 返回 null', () => {
      make('new', 0); make('mastered', 0)
      expect(pickPopupWord()).toBeNull()
    })

    it('空词库 → 返回 null', () => {
      expect(pickPopupWord()).toBeNull()
    })
  })

  describe('popupNow（选词 + incrementPop + showPopup）', () => {
    it('到期词时：incrementPop +1 且 showPopup 收到 due 词', () => {
      const due = make('learning', 0)
      const fakeWin = { tag: 'win' } as unknown as Parameters<typeof showPopup>[0]
      const before = getPopCount()
      popupNow(() => fakeWin)
      expect(getPopCount()).toBe(before + 1)
      expect(showPopupMock).toHaveBeenCalledTimes(1)
      expect(showPopupMock).toHaveBeenCalledWith(fakeWin, expect.objectContaining({ id: due.id }))
    })

    it('无候选词时：不弹也不增节拍（静默 return）', () => {
      make('new', 0); make('mastered', 0)
      const before = getPopCount()
      popupNow(() => ({ tag: 'win' } as unknown as Parameters<typeof showPopup>[0]))
      expect(getPopCount()).toBe(before)
      expect(showPopupMock).not.toHaveBeenCalled()
    })
  })
})
