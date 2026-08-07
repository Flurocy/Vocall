// B1 图表坐标换算纯函数。抽到独立文件供 vitest 直接测，图表组件只负责渲染。
// 所有函数处理边界：单点/空数组/全 0，绝不除零。

export interface Padding {
  t: number
  r: number
  b: number
  l: number
}

// 绘图区内尺寸
export function plotSize(w: number, h: number, pad: Padding): { pw: number; ph: number } {
  return { pw: Math.max(0, w - pad.l - pad.r), ph: Math.max(0, h - pad.t - pad.b) }
}

// 线性比例尺：domain [d0,d1] → range [r0,r1]。domain 退化（d0===d1）时返回 range 中点，防除零。
export function makeScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  if (d0 === d1) return () => (r0 + r1) / 2
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)
}

// X 轴：n 个类目均匀分布在 [pad.l, w-pad.r]。n=1 时落中点；n=0 返回 pad.l。
export function bandX(i: number, n: number, w: number, pad: Padding): number {
  const { pw } = plotSize(w, 0, pad)
  if (n <= 1) return pad.l + pw / 2
  return pad.l + (i / (n - 1)) * pw
}

// 柱状图单柱几何：n 根柱、柱间隙占比 gapRatio，返回每根柱的 x 与宽度。
export function barGeom(i: number, n: number, w: number, pad: Padding, gapRatio = 0.35): { x: number; bw: number } {
  const { pw } = plotSize(w, 0, pad)
  if (n <= 0) return { x: pad.l, bw: 0 }
  const slot = pw / n
  const bw = slot * (1 - gapRatio)
  return { x: pad.l + i * slot + (slot - bw) / 2, bw }
}

// Y 轴上限取整到"好看"的刻度（niceCeil）：1/2/5/10/20/50… 量级。
// 柱状图 Y 上限用，让顶刻度是整数且略高于最大值。max=0 时返回 4（保底几格）。
export function niceCeil(max: number): number {
  if (max <= 0) return 4
  const mag = Math.pow(10, Math.floor(Math.log10(max)))
  const norm = max / mag // 1..10
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * mag
}

// 生成 Y 轴刻度值数组（含 0 与顶）。count 为期望间隔数。
export function yTicks(max: number, count = 4): number[] {
  const top = niceCeil(max)
  const step = top / count
  const out: number[] = []
  for (let i = 0; i <= count; i++) out.push(Math.round(step * i * 100) / 100)
  return out
}
