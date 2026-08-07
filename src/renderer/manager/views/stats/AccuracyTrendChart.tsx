import type { ReactElement } from 'react'
import type { Theme } from '../../../theme'
import type { TrendPoint } from '../../../../shared/ipc-types'

// 占位：包 5b 填充正确率趋势面积图
export default function AccuracyTrendChart(_props: { theme: Theme; trend: TrendPoint[] }): ReactElement {
  return <div className="text-xs text-slate-400">趋势图（包 5b）</div>
}
