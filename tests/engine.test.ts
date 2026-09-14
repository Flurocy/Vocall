import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { addVocab, updateVocab } from '../src/main/vocab'
import { _resetStoreForTests } from '../src/main/store'
import { setSetting } from '../src/main/settings'
import { _logTest } from '../src/main/logger'

// showPopup  mock 成 no-op：引擎测试只关心定时器排程行为，不碰真实弹窗（Electron 窗口）。
vi.mock('../src/main/popup', () => ({ showPopup: vi.fn() }))
import { showPopup } from '../src/main/popup'
import { startEngine, rescheduleInterval, rescheduleDnd, _resetEngineForTests } from '../src/main/engine'

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

// 免打扰（dnd_enabled）：开启时 tick 跳过弹出且节拍（popCount）不走，转 15s 空转重查；
// 关闭后按正常间隔恢复（不立即补弹——关掉瞬间糊脸太突兀）。
describe('engine 免打扰（dnd_enabled）', () => {
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

  it('免打扰开启：启动 tick 不弹词，15s 空转重查仍不弹', () => {
    makeLearningDue()
    setSetting('dnd_enabled', 'true')
    startEngine(fakeGetPopup)
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(0) // 到期词被拦住
    vi.advanceTimersByTime(15_000) // idle 重查到点
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(0) // 仍不弹
    const dndLines = _logTest.lines.filter((l) => l.includes('免打扰')).length
    expect(dndLines).toBe(2) // 两次 tick 都走免打扰分支
  })

  it('运行中开免打扰：取消挂起的弹出计时，到点不再弹', () => {
    makeLearningDue()
    setSetting('popup_interval_sec', '60')
    startEngine(fakeGetPopup)
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(1) // 正常弹出一次，挂 60s
    setSetting('dnd_enabled', 'true')
    rescheduleDnd()
    vi.advanceTimersByTime(120_000)
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(1) // 原 60s 计时已取消，不再弹
  })

  it('关闭免打扰：不立即补弹，按正常间隔恢复', () => {
    makeLearningDue()
    setSetting('popup_interval_sec', '60')
    setSetting('dnd_enabled', 'true')
    startEngine(fakeGetPopup)
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(0)
    setSetting('dnd_enabled', 'false')
    rescheduleDnd()
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(0) // 重排本身不弹
    vi.advanceTimersByTime(59_000)
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(0)
    vi.advanceTimersByTime(1_000)
    expect(vi.mocked(showPopup)).toHaveBeenCalledTimes(1) // 间隔到点恢复弹出
  })
})
