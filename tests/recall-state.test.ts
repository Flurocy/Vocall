import { describe, it, expect, beforeEach } from 'vitest'
import {
  _resetStoreForTests,
  getSrsState,
  setSrsState,
  setSrsStateBatch,
  type DirectionState,
} from '../src/main/store'

// 反转回忆模式 包1 数据层（设计稿 v1.6.1-反转回忆模式 §3.2）：
// SrsState 顶层字段 = 再认（recognition）方向，向后兼容；
// 可选嵌套 recall = 回忆方向独立进度（undefined=未开启/未轮到，用到才初始化，不迁移旧数据）。

const recallOf = (duePop: number): DirectionState => ({
  easiness: 2.5,
  repetitions: 0,
  duePop,
  forgotCount: 0,
})

describe('SrsState.recall —— 可选回忆方向子状态', () => {
  beforeEach(() => _resetStoreForTests())

  it('旧格式状态（无 recall）：读回 recall 为 undefined（零迁移、向后兼容）', () => {
    setSrsState(1, { easiness: 2.5, repetitions: 3, duePop: 100, forgotCount: 1 })
    const s = getSrsState(1)
    expect(s?.recall).toBeUndefined()
    expect(s?.duePop).toBe(100) // 顶层字段不受影响
  })

  it('带 recall 的状态：写读往返一致，两方向进度互不影响', () => {
    setSrsState(2, { easiness: 2.6, repetitions: 5, duePop: 200, forgotCount: 0, recall: recallOf(50) })
    const s = getSrsState(2)
    expect(s?.recall).toEqual(recallOf(50))
    expect(s?.easiness).toBe(2.6)
    // 改 recall 不影响顶层（再认方向）
    setSrsState(2, { ...s!, recall: { ...s!.recall!, duePop: 60, repetitions: 1 } })
    const s2 = getSrsState(2)
    expect(s2?.recall?.duePop).toBe(60)
    expect(s2?.duePop).toBe(200)
  })

  it('setSrsStateBatch 批量写入：recall 字段原样保留', () => {
    setSrsStateBatch({
      3: { easiness: 2.5, repetitions: 0, duePop: 0, forgotCount: 0, recall: recallOf(0) },
      4: { easiness: 2.5, repetitions: 0, duePop: 0, forgotCount: 0 },
    })
    expect(getSrsState(3)?.recall).toEqual(recallOf(0))
    expect(getSrsState(4)?.recall).toBeUndefined()
  })
})
