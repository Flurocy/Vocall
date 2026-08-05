import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { VocabItem } from '../src/main/vocab'

// mock electron：popup.ts 用到 screen（算右下角锚点）与 ipcMain（注册 IPC，测试不触发）。
vi.mock('electron', () => ({
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  screen: {
    getPrimaryDisplay: () => ({
      workAreaSize: { width: 1920, height: 1080 },
      workArea: { x: 0, y: 0 },
    }),
  },
}))

import { showPopup, hidePopup, previewPopup, endPreview, _previewState, _resetPopupForTests } from '../src/main/popup'
import { _resetStoreForTests } from '../src/main/store'

// 假弹窗窗口：只实现测试断言用到的方法
function fakeWin(): BrowserWindow & {
  send: ReturnType<typeof vi.fn>
  hide: ReturnType<typeof vi.fn>
  setBounds: ReturnType<typeof vi.fn>
  setOpacity: ReturnType<typeof vi.fn>
} {
  const w = {
    webContents: { send: vi.fn() },
    showInactive: vi.fn(),
    hide: vi.fn(),
    setBounds: vi.fn(),
    setOpacity: vi.fn(),
    isDestroyed: () => false,
  }
  return Object.assign(w, { send: w.webContents.send }) as never
}

const REAL_ITEM: VocabItem = {
  id: 1, word: 'apple', meaning: 'n. 苹果', example: 'An apple a day.',
  topic: null, book: null, status: 'learning', source: 't', created_at: 0,
}

describe('弹窗外观预览——冲突防护', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetStoreForTests()
    _resetPopupForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('规则①：真词正显示时不换内容（返回 false，不进预览态），但外观临时值照样应用', () => {
    const win = fakeWin()
    showPopup(win, REAL_ITEM) // 真词弹出，窗口可见
    expect(_previewState().visible).toBe(true)
    const showCallsBefore = win.send.mock.calls.filter((c) => c[0] === 'popup:show').length
    expect(previewPopup(win, { scale: 1.5, opacity: 0.6, fontScale: 1.2 })).toBe(false) // 不进预览模式
    expect(_previewState().previewing).toBe(false)
    // 内容不被换掉：没有新的 popup:show
    expect(win.send.mock.calls.filter((c) => c[0] === 'popup:show').length).toBe(showCallsBefore)
    // 但临时外观值应用到了真弹窗：尺寸/透明度窗口级生效 + 字体倍率消息发给卡片
    expect(win.setBounds).toHaveBeenCalledWith({
      width: 540, height: 360, x: 1920 - 540 - 24, y: 1080 - 360 - 24,
    })
    expect(win.setOpacity).toHaveBeenCalledWith(0.6)
    expect(win.send).toHaveBeenCalledWith('popup:fontScale', 1.2)
  })

  it('规则②：预览进行中真词来了——真词无条件接管，预览态作废', () => {
    const win = fakeWin()
    expect(previewPopup(win, {})).toBe(true)
    expect(_previewState().previewing).toBe(true)
    endPreview(win) // 进入"松手 3s 收起"倒计时
    showPopup(win, REAL_ITEM) // 真词到达
    expect(_previewState().previewing).toBe(false) // 预览态被清
    vi.advanceTimersByTime(3000) // 原预览收起倒计时到点
    expect(_previewState().visible).toBe(true) // 真词不被误关（endPreview 内判 previewing 已 false）
  })

  it('真词自动隐藏后（current 残留但窗口不可见）允许预览', () => {
    const win = fakeWin()
    showPopup(win, REAL_ITEM)
    vi.advanceTimersByTime(15_000) // popup_stay_sec 默认 15s → 自动隐藏
    expect(_previewState().visible).toBe(false)
    expect(previewPopup(win, {})).toBe(true) // 不阻塞——否则第一个真词弹过就永远预览不了
  })

  it('松手 endPreview：3s 后自动收起预览，3s 内不收', () => {
    const win = fakeWin()
    previewPopup(win, {})
    endPreview(win)
    vi.advanceTimersByTime(2999)
    expect(win.hide).not.toHaveBeenCalled()
    expect(_previewState().previewing).toBe(true)
    vi.advanceTimersByTime(1)
    expect(win.hide).toHaveBeenCalledTimes(1)
    expect(_previewState().previewing).toBe(false)
  })

  it('连续拖动重置收起倒计时（拖新滑块→上次的 3s 作废）', () => {
    const win = fakeWin()
    previewPopup(win, {})
    endPreview(win)
    vi.advanceTimersByTime(2000)
    previewPopup(win, {}) // 又拖了一下
    endPreview(win) // 重新松手
    vi.advanceTimersByTime(2000)
    expect(win.hide).not.toHaveBeenCalled() // 距第二次松手才 2s
    vi.advanceTimersByTime(1000)
    expect(win.hide).toHaveBeenCalledTimes(1)
  })

  it('预览词 id=-1 且带 preview 标记（评分拦截/渲染静音徽标的依据）', () => {
    const win = fakeWin()
    previewPopup(win, {})
    const sent = win.send.mock.calls.find((c) => c[0] === 'popup:show')
    expect(sent).toBeTruthy()
    expect((sent![1] as VocabItem).id).toBe(-1)
  })

  it('临时值直接应用窗口：scale 重算尺寸（clamp 上限 1.5）、opacity clamp 下限 0.5', () => {
    const win = fakeWin()
    previewPopup(win, { scale: 1.5, opacity: 0.2 })
    expect(win.setBounds).toHaveBeenCalledWith({
      width: 540, height: 360, x: 1920 - 540 - 24, y: 1080 - 360 - 24,
    })
    expect(win.setOpacity).toHaveBeenCalledWith(0.5) // 0.2 被 clamp 到下限
  })

  it('hidePopup/dismiss 路径：预览中关闭窗口会清预览态（由 popup:dismiss 链路模拟）', () => {
    const win = fakeWin()
    previewPopup(win, {})
    expect(_previewState().previewing).toBe(true)
    hidePopup(win)
    expect(_previewState().visible).toBe(false)
  })
})
