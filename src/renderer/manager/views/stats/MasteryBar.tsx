import type { ReactElement } from 'react'
import type { Theme } from '../../../theme'
import type { MasteryCount } from '../../../../shared/ipc-types'

// B1 掌握度分布：水平堆叠条（非 pie）。4 类固定序 new/learning/review/mastered。
// 配色复用生词库徽标语义（new=slate/learning=主题 accent/review=emerald/mastered=amber），
// 段间 2px 表面间隙，段下直接标注数值（identity 不靠颜色单独承载）。
interface Seg {
  key: keyof MasteryCount
  label: string
  // Tailwind 完整字面量类（JIT 约束，禁止拼接）
  bar: string
  dot: string
}

export default function MasteryBar({ theme, mastery }: { theme: Theme; mastery: MasteryCount }): ReactElement {
  const segs: Seg[] = [
    { key: 'learning', label: '学习中', bar: 'bg-current', dot: theme.accentText },
    { key: 'review', label: '复习中', bar: 'bg-emerald-500', dot: 'text-emerald-600' },
    { key: 'new', label: '待学习', bar: 'bg-slate-400', dot: 'text-slate-500' },
    { key: 'mastered', label: '已掌握', bar: 'bg-amber-500', dot: 'text-amber-600' },
  ]
  const total = segs.reduce((s, x) => s + mastery[x.key], 0)

  return (
    <div>
      {/* 堆叠条：段宽按占比 %，间隙靠 gap + 圆角容器。全 0 时显示空态轨道 */}
      <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full bg-black/[0.06]">
        {total > 0 &&
          segs.map((s) => {
            const n = mastery[s.key]
            if (n === 0) return null
            const pct = (n / total) * 100
            return (
              <div
                key={s.key}
                style={{ width: `${pct}%` }}
                className={`h-full min-w-[3px] rounded-full transition-all ${s.bar} ${s.key === 'learning' ? theme.accentText : ''}`}
                title={`${s.label} ${n}`}
              />
            )
          })}
      </div>
      {/* 直接标注：色点 + 标签 + 数值（数值用 ink，色点承载 identity） */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segs.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-sm">
            <span className={`h-2 w-2 rounded-full ${s.bar} ${s.key === 'learning' ? theme.accentText : ''}`} />
            <span className="text-slate-600">{s.label}</span>
            <span className="font-medium text-slate-800">{mastery[s.key]}</span>
          </div>
        ))}
        <div className="ml-auto text-sm text-slate-500">共 {total} 词</div>
      </div>
    </div>
  )
}
