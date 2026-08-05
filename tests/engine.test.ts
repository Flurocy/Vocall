import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { addVocab, updateVocab } from '../src/main/vocab'
import { _resetStoreForTests } from '../src/main/store'
import { setSetting } from '../src/main/settings'
import { _logTest } from '../src/main/logger'

// showPopup  mock 成 no-op：引擎测试只关心定时器排程行为，不碰真实弹窗（Electron 窗口）。
vi.mock('../src/main/popup', () => ({ showPopup: vi.fn() }))
import { showPopup } from '../src/main/popup'
import { startEngine, rescheduleInterval, _resetEngineForTests } from '../src/main/engine'

const fakeGetPopup = (() => null) as unknown as () => BrowserWindow

function makeLearningDue(): void {
  const v = addVocab({ word: `w${Math.random()}`, meaning: 'm', example: 'e', topic: null, source: 's' })
  updateVocab(v.id, { status: 'learning' }) // addVocab 默认 new（统一队列），这里显式提升 learning；duePop=当前 popCount 立即到期
}

describe('engine 间隔重排（rescheduleInterval）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetStoreForTests()
    _resetEngineForTests()
    _logTest.start()
    vi.mocked(showPopup).mockClear()
  })
  afterEach(() => {
    _resetEngineForTests()
    _logTest.stop()
    vi.useRealTimers()
  })

  it('弹词后挂起"弹出间隔"计时；改间隔+reschedule → 按新间隔弹下一词', () => {
    makeLearningDue()
    setSetting('popup_interval_sec', '480')
    startEngine(fakeGetPopup)
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(1) // 启动即弹出到期词

    // 旧间隔 480s：只走 60s 不应再弹
    setSetting('popup_interval_sec', '60')
    rescheduleInterval() // 重排为 60s
    vi.advanceTimersByTime(59_000)
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1_000)
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(2) // 新间隔 60s 到点弹出
  })

  it('reschedule 只重排不立即弹词（不额外触发 showPopup）', () => {
    makeLearningDue()
    startEngine(fakeGetPopup)
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(1)
    setSetting('popup_interval_sec', '1')
    rescheduleInterval()
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(1) // 重排本身不弹
    vi.advanceTimersByTime(1_000)
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(2) // 1s 后才弹
  })

  it('队列真空（idle 15s 重查）时 reschedule 不动计时', () => {
    // 无任何词 → tick 走"队列真空"分支，挂起 idle 15s
    startEngine(fakeGetPopup)
    const idleLines = (): number => _logTest.lines.filter((l) => l.includes('队列真空')).length
    expect(idleLines()).toBe(1)
    rescheduleInterval() // pendingKind='idle' → no-op
    vi.advanceTimersByTime(14_000)
    expect(idleLines()).toBe(1) // 15s 未到，未重查
    vi.advanceTimersByTime(1_000)
    expect(idleLines()).toBe(2) // 仍按原 15s 节奏重查（未被间隔设置影响）
  })
})
