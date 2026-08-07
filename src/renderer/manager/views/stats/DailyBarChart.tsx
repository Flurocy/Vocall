import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { Theme } from '../../../theme'
import type { TrendPoint } from '../../../../shared/ipc-types'
import { barGeom, makeScale, plotSize, yTicks, type Padding } from './chart-utils'

// B1 每日答题量：柱状图（dataviz magnitude 形态，单 hue sequential）。
// - 柱 4px 圆角只圆顶部两角、贴 baseline；柱宽 cap ≤24px（留空气感）
// - 柱本身是 hover 命中目标：hover fill-opacity 0.8→1 提起 + tooltip
// - recessive 网格 + ink 刻度；配色 currentColor 跟随主题
const W = 640
const H = 220
const PAD: Padding = { t: 16, r: 16, b: 28, l: 36 }
const MAX_BAR = 24

// 只圆顶部两角的柱 path（底边直角贴 baseline）。h=0 时不画。
function barPath(x: number, bw: number, top: number, base: number, r: number): string {
  const rr = Math.min(r, bw / 2, base - top)
  return [
    `M${x},${base}`,
    `L${x},${top + rr}`,
    `Q${x},${top} ${x + rr},${top}`,
    `L${x + bw - rr},${top}`,
    `Q${x + bw},${top} ${x + bw},${top + rr}`,
    `L${x + bw},${base}`,
    'Z',
  ].join(' ')
}

export default function DailyBarChart({ theme, trend }: { theme: Theme; trend: TrendPoint[] }): ReactElement {
  const [hover, setHover] = useState<number | null>(null)
  const { ph } = plotSize(W, H, PAD)
  const base = PAD.t + ph

  const maxTotal = Math.max(0, ...trend.map((p) => p.total))
  const y = useMemo(() => makeScale(0, Math.max(4, ...yTicks(maxTotal).slice(-1)), base, PAD.t), [maxTotal, base])
  const ticks = yTicks(maxTotal, 4)

  const bars = useMemo(
    () =>
      trend.map((p, i) => {
        const g = barGeom(i, trend.length, W, PAD)
        const bw = Math.min(g.bw, MAX_BAR)
        const x = g.x + (g.bw - bw) / 2 // 居中于槽内（cap 柱宽后重新居中）
        return { x, bw, top: y(p.total), p }
      }),
    [trend, y],
  )

  const hoverBar = hover === null ? null : bars[hover]

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${theme.accentText}`} role="img" aria-label="近 30 天每日答题量">
        {/* recessive 网格 + Y 刻度 */}
        <g className="text-slate-300">
          {ticks.map((t) => (
            <line key={t} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeWidth={1} />
          ))}
        </g>
        <g className="text-slate-400" fontSize={10}>
          {ticks.map((t) => (
            <text key={t} x={PAD.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fill="currentColor">
              {t}
            </text>
          ))}
        </g>

        {/* 柱：顶部 4px 圆角贴 baseline；hover 提起（fill-opacity 0.75→1） */}
        {bars.map((b, i) =>
          b.p.total === 0 ? null : (
            <path
              key={i}
              d={barPath(b.x, b.bw, b.top, base, 4)}
              fill="currentColor"
              fillOpacity={hover === i ? 1 : 0.75}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity"
            />
          ),
        )}

        {/* baseline */}
        <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} stroke="currentColor" strokeWidth={1} className="text-slate-300" />

        {/* X 轴日期：首/中/尾 */}
        <g className="text-slate-400" fontSize={10}>
          {bars.map((b, i) =>
            i === 0 || i === Math.floor(bars.length / 2) || i === bars.length - 1 ? (
              <text key={i} x={b.x + b.bw / 2} y={H - 8} textAnchor="middle" fill="currentColor">
                {b.p.date.slice(5)}
              </text>
            ) : null,
          )}
        </g>
      </svg>

      {/* tooltip */}
      {hoverBar && (
        <div
          className="pointer-events-none absolute rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${((hoverBar.x + hoverBar.bw / 2) / W) * 100}%`,
            top: 0,
            transform: `translateX(${(hoverBar.x + hoverBar.bw / 2) / W > 0.7 ? '-110%' : (hoverBar.x + hoverBar.bw / 2) / W < 0.3 ? '10%' : '-50%'})`,
          }}
        >
          <div className="font-semibold text-slate-800">{hoverBar.p.total} 题</div>
          <div className="text-slate-500">{hoverBar.p.date.slice(5)}</div>
        </div>
      )}
    </div>
  )
}
