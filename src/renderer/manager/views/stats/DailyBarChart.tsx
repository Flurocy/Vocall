import type { ReactElement } from 'react'
import type { Theme } from '../../../theme'
import type { TrendPoint } from '../../../../shared/ipc-types'

// 占位：包 5c 填充每日答题量柱状图
export default function DailyBarChart(_props: { theme: Theme; trend: TrendPoint[] }): ReactElement {
  return <div className="text-xs text-slate-400">柱状图（包 5c）</div>
}
