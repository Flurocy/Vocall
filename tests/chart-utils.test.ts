import { describe, it, expect } from 'vitest'
import { plotSize, makeScale, bandX, barGeom, niceCeil, yTicks, type Padding } from '../src/renderer/manager/views/stats/chart-utils'

const pad: Padding = { t: 16, r: 16, b: 28, l: 36 }

describe('chart-utils', () => {
  it('plotSize 减去四向 padding', () => {
    expect(plotSize(640, 220, pad)).toEqual({ pw: 588, ph: 176 })
  })

  describe('makeScale', () => {
    it('端点映射到 range 端点', () => {
      const y = makeScale(0, 100, 176, 0) // 值 0→底，100→顶
      expect(y(0)).toBe(176)
      expect(y(100)).toBe(0)
      expect(y(50)).toBe(88)
    })
    it('domain 退化（d0===d1）返回 range 中点不除零', () => {
      const y = makeScale(5, 5, 0, 100)
      expect(y(5)).toBe(50)
    })
  })

  describe('bandX', () => {
    it('首尾贴绘图区边缘', () => {
      expect(bandX(0, 5, 640, pad)).toBe(36)
      expect(bandX(4, 5, 640, pad)).toBe(624)
    })
    it('n=1 落中点', () => {
      expect(bandX(0, 1, 640, pad)).toBe(36 + 588 / 2)
    })
  })

  describe('barGeom', () => {
    it('柱在绘图区内且间隙均匀', () => {
      const g0 = barGeom(0, 4, 640, pad)
      const g3 = barGeom(3, 4, 640, pad)
      expect(g0.x).toBeGreaterThanOrEqual(pad.l)
      expect(g3.x + g3.bw).toBeLessThanOrEqual(640 - pad.r)
      expect(g0.bw).toBeGreaterThan(0)
    })
    it('n=0 不除零', () => {
      expect(barGeom(0, 0, 640, pad)).toEqual({ x: pad.l, bw: 0 })
    })
  })

  describe('niceCeil', () => {
    it('取整到 1/2/5/10 量级且 ≥ max', () => {
      expect(niceCeil(3)).toBe(5)
      expect(niceCeil(7)).toBe(10)
      expect(niceCeil(23)).toBe(50) // 23/10=2.3 → 5×10
      expect(niceCeil(1)).toBe(1)
    })
    it('max=0 返回保底 4', () => {
      expect(niceCeil(0)).toBe(4)
    })
  })

  describe('yTicks', () => {
    it('含 0 与顶，长度为 count+1', () => {
      const t = yTicks(7, 4)
      expect(t[0]).toBe(0)
      expect(t[t.length - 1]).toBe(10)
      expect(t.length).toBe(5)
    })
  })
})
