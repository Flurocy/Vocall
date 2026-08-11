import type { ReactElement } from 'react'
import type { Theme } from '../../theme'

// 首启更新日志弹窗（v1.6.0 设计稿 3.3 时机②）：更新后首次打开显示一次当前版本的更新内容。
// 「不反复显示」由主进程 last_seen_changelog_version 控制——getPendingChangelog 已在返回时写入当前版本，
// 这里只负责展示 + 关闭。内容 = Release body（纯文本预换行渲染）。
interface Props {
  theme: Theme
  version: string
  notes: string
  onClose: () => void
}

export default function ChangelogModal({ theme, version, notes, onClose }: Props): ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl border border-black/10 ${theme.bgCard} p-6 shadow-2xl backdrop-blur-md`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={`text-base font-semibold ${theme.accentText}`}>已更新到 v{version}</h3>
        <div className="manager-scroll mt-3 max-h-72 overflow-auto rounded-lg bg-black/5 p-3.5 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
          {notes}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            autoFocus
            onClick={onClose}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${theme.accentSolid} ${theme.accentSolidHover}`}
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
