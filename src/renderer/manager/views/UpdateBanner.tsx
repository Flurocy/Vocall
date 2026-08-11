import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { Theme } from '../../theme'
import type { UpdateStatus } from '../../../shared/ipc-types'

// 覆盖式自动更新的渲染端卡片（v1.6.0）：挂在管理窗口顶层，订阅主进程 'update:status' 推送。
//
// 展示逻辑（贴现有卡片语言 + Theme token）：
//   available   → 「发现新版本 vX.Y.Z」+ 更新日志 + [立即更新]/[稍后]
//   downloading → 进度条（percent）
//   downloaded  → 「已下载完成」+ [重启完成更新]/[稍后]
//   none/error  → 启动静默检查来源不弹卡片（error 在设置页手动检查时另显示）；本卡片只在"有实质进展"时出现
//
// 「稍后」= 本会话不再烦（dismissed 置位）；下次启动检查到新版仍会弹（因为是"有新版"非"已读"）。
interface Props {
  theme: Theme
}

export default function UpdateBanner({ theme }: Props): ReactElement | null {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // 先拉一次最近状态（错过挂载前事件的兜底），再订阅后续推送
    void window.vocall.getUpdateStatus().then((s) => {
      if (s.state !== 'idle') setStatus(s)
    })
    const off = window.vocall.onUpdateStatus((s) => {
      setStatus(s)
      if (s.state === 'available') setDismissed(false) // 新版出现要重新弹（即使上次稍后过别的版本）
    })
    return off
  }, [])

  if (dismissed) return null

  // 只在这三个状态渲染卡片；idle/none/error 不弹（error 交由设置页手动检查显示）
  if (status.state === 'available') {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl border border-black/10 bg-white/90 p-4 shadow-2xl backdrop-blur-md">
        <p className={`text-sm font-medium ${theme.accentText}`}>发现新版本 v{status.version}</p>
        {status.releaseNotes && (
          <div className="manager-scroll mt-2 max-h-32 overflow-auto rounded-lg bg-black/5 p-2.5 text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">
            {status.releaseNotes}
          </div>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-black/5"
          >
            稍后
          </button>
          <button
            onClick={() => void window.vocall.downloadUpdate()}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${theme.accentSolid} ${theme.accentSolidHover}`}
          >
            立即更新
          </button>
        </div>
      </div>
    )
  }

  if (status.state === 'downloading') {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl border border-black/10 bg-white/90 p-4 shadow-2xl backdrop-blur-md">
        <p className={`text-sm font-medium ${theme.accentText}`}>正在下载更新…</p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
          <div
            className={`h-full rounded-full transition-all ${theme.accentBg}`}
            style={{ width: `${status.percent}%` }}
          />
        </div>
        <p className="mt-1.5 text-right text-xs text-slate-500">{status.percent}%</p>
      </div>
    )
  }

  if (status.state === 'downloaded') {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl border border-black/10 bg-white/90 p-4 shadow-2xl backdrop-blur-md">
        <p className={`text-sm font-medium ${theme.accentText}`}>更新已下载完成</p>
        <p className="mt-1.5 text-xs text-slate-600">重启应用即可完成更新（退出时也会自动安装）。</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-black/5"
          >
            稍后
          </button>
          <button
            onClick={() => void window.vocall.installUpdate()}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${theme.accentSolid} ${theme.accentSolidHover}`}
          >
            重启完成更新
          </button>
        </div>
      </div>
    )
  }

  return null
}
