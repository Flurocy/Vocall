import { useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { Theme } from '../../theme'
import type { StatsOverview } from '../../../shared/ipc-types'
import MasteryBar from './stats/MasteryBar'
import AccuracyTrendChart from './stats/AccuracyTrendChart'
import DailyBarChart from './stats/DailyBarChart'

// B1 学习统计页。数据"点开可看"：分区可折叠（默认展开核心，明细折叠）。
// 配色全走 theme token + 中性色；图表 SVG 用 currentColor 跟随主题。

// 可折叠分区容器：标题 + 右侧展开/收起箭头。defaultOpen 控制初态。
function Section({
  title,
  children,
  defaultOpen = true,
  hint,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  hint?: string
}): ReactElement {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="mb-5 rounded-2xl border border-black/10 bg-white/60 shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
      >
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {hint && <span className="text-xs text-slate-400">{hint}</span>}
        </div>
        <span className={`text-xs text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  )
}

// 总览数字 tile
function Tile({ label, value, sub }: { label: string; value: string; sub?: string }): ReactElement {
  return (
    <div className="rounded-xl border border-black/10 bg-white/70 px-4 py-3.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}

export default function StatsView({ theme }: { theme: Theme }): ReactElement {
  const [data, setData] = useState<StatsOverview | null>(null)

  useEffect(() => {
    void window.vocall.getStatsOverview().then(setData)
  }, [])

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-6 text-xl font-semibold">统计</h2>
        <p className="text-sm text-slate-400">加载中…</p>
      </div>
    )
  }

  const empty = data.totalAnswers === 0

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">统计</h2>
        <span className="text-sm text-slate-500">近 30 天</span>
      </header>

      {empty ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-black/15 bg-white/40 px-6 py-12 text-center">
          <p className="text-sm text-slate-600">还没有答题数据</p>
          <p className="mt-1 text-xs text-slate-400">弹窗背几个词后，这里会出现正确率趋势和掌握度分布</p>
        </div>
      ) : (
        <>
          {/* 总览三 tile */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            <Tile label="累计答题" value={String(data.totalAnswers)} sub="次" />
            <Tile
              label="总正确率"
              value={data.overallAccuracy === null ? '—' : `${data.overallAccuracy}%`}
              sub="认识占比"
            />
            <Tile label="连续学习" value={String(data.streakDays)} sub="天" />
          </div>

          {/* 掌握度分布 */}
          <Section title="掌握度分布" hint="四态词数占比">
            <MasteryBar theme={theme} mastery={data.mastery} />
          </Section>

          {/* 正确率趋势 */}
          <Section title="正确率趋势" hint="近 30 天每日">
            <AccuracyTrendChart theme={theme} trend={data.trend} />
          </Section>

          {/* 每日答题量 */}
          <Section title="每日答题量" hint="近 30 天">
            <DailyBarChart theme={theme} trend={data.trend} />
          </Section>

          {/* 近期明细：默认折叠，点开可看 */}
          <Section title="近期答题明细" hint={`最近 ${data.recent.length} 条`} defaultOpen={false}>
            <ul className="space-y-1.5">
              {data.recent.map((e, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{e.word}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      e.grade === 2
                        ? `${theme.accentBg} ${theme.accentText}`
                        : e.grade === 1
                          ? 'bg-amber-500/15 text-amber-700'
                          : 'bg-rose-500/10 text-rose-600'
                    }`}
                  >
                    {e.grade === 2 ? '认识' : e.grade === 1 ? '模糊' : '忘了'}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  )
}
