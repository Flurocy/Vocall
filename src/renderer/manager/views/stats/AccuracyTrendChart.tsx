import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { Theme } from '../../../theme'
import type { TrendPoint } from '../../../../shared/ipc-types'
import { bandX, makeScale, plotSize, yTicks, type Padding } from './chart-utils'

// B1 正确率趋势：单系列面积图（dataviz：trend over time，单 hue）。
// - 当日 0 题（accuracy=null）→ 断点：线段/面积在此断开，不画 0% 误导
// - crosshair 竖线吸附最近日期 + tooltip 显示该日正确率/答题数
// - 面积 10% 透明、线 2px、白芯圆点 r=4（带 2px 表面环）
// - 配色 currentColor：svg 挂 theme.accentText，换肤自动跟随；网格/轴用 slate 灰
const W = 640
const H = 220
const PAD: Padding = { t: 16, r: 16, b: 28, l: 36 }

// 把连续非 null 点分组：每段是一条独立折线/面积（null 处断开）
function splitSegments(pts: { x: number; y: number; p: TrendPoint }[]): { x: number; y: number; p: TrendPoint }[][] {
  const segs: { x: number; y: number; p: TrendPoint }[][] = []
  let cur: { x: number; y: number; p: TrendPoint }[] = []
  for (const pt of pts) {
    if (pt.p.accuracy === null) {
      if (cur.length) segs.push(cur)
      cur = []
    } else {
      cur.push(pt)
    }
  }
  if (cur.length) segs.push(cur)
  return segs
}

export default function AccuracyTrendChart({ theme, trend }: { theme: Theme; trend: TrendPoint[] }): ReactElement {
  const [hover, setHover] = useState<number | null>(null) // 吸附到的数据下标

  const { pw, ph } = plotSize(W, H, PAD)
  const base = PAD.t + ph // X 轴 baseline 的 y 像素

  // Y 比例尺：0-100 → [baseline, 顶]
  const y = useMemo(() => makeScale(0, 100, base, PAD.t), [base])

  // 每个数据点像素坐标（null 也算出 x，供 crosshair 吸附；y 仅非 null 有意义）
  const pts = useMemo(
    () =>
      trend.map((p, i) => ({
        x: bandX(i, trend.length, W, PAD),
        y: p.accuracy === null ? base : y(p.accuracy),
        p,
      })),
    [trend, y, base],
  )

  const segments = useMemo(() => splitSegments(pts), [pts])
  const ticks = yTicks(100, 4) // 0/25/50/75/100

  // 吸附最近下标：crosshair 找最近的数据 X
  const onMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let bd = Infinity
    pts.forEach((pt, i) => {
      const d = Math.abs(pt.x - mx)
      if (d < bd) { bd = d; best = i }
    })
    setHover(best)
  }

  const hoverPt = hover === null ? null : pts[hover]

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full ${theme.accentText}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="近 30 天正确率趋势"
      >
        {/* recessive 网格（淡灰 hairline）+ Y 轴刻度文字（ink token） */}
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

        {/* 面积 + 折线：按段渲染（null 断开） */}
        {segments.map((seg, si) => {
          if (seg.length === 1) {
            // 单点段：只画点（连线无意义）
            return null
          }
          const line = seg.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x},${pt.y}`).join(' ')
          const area = `${line} L${seg[seg.length - 1].x},${base} L${seg[0].x},${base} Z`
          return (
            <g key={si}>
              <path d={area} fill="currentColor" fillOpacity={0.12} />
              <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })}

        {/* 数据点：白芯圆点（带表面环），仅非 null 日 */}
        {pts.map((pt, i) =>
          pt.p.accuracy === null ? null : (
            <circle key={i} cx={pt.x} cy={pt.y} r={4} fill="#fff" stroke="currentColor" strokeWidth={2} />
          ),
        )}

        {/* crosshair 竖线（吸附） */}
        {hoverPt && (
          <line
            x1={hoverPt.x}
            x2={hoverPt.x}
            y1={PAD.t}
            y2={base}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.35}
          />
        )}

        {/* X 轴日期标签：首/中/尾三个，避免拥挤 */}
        <g className="text-slate-400" fontSize={10}>
          {pts.map((pt, i) =>
            i === 0 || i === Math.floor(pts.length / 2) || i === pts.length - 1 ? (
              <text key={i} x={pt.x} y={H - 8} textAnchor="middle" fill="currentColor">
                {pt.p.date.slice(5)} {/* 截 MM-DD */}
              </text>
            ) : null,
          )}
        </g>
      </svg>

      {/* tooltip：值为主标签为辅，HTML 绝对定位（不随 SVG 缩放） */}
      {hoverPt && (
        <div
          className="pointer-events-none absolute rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${(hoverPt.x / W) * 100}%`,
            top: 0,
            transform: `translateX(${hoverPt.x / W > 0.7 ? '-110%' : hoverPt.x / W < 0.3 ? '10%' : '-50%'})`,
          }}
        >
          <div className="font-semibold text-slate-800">
            {hoverPt.p.accuracy === null ? '无答题' : `${hoverPt.p.accuracy}%`}
          </div>
          <div className="text-slate-500">
            {hoverPt.p.date.slice(5)} · {hoverPt.p.total} 题
          </div>
        </div>
      )}
    </div>
  )
}
