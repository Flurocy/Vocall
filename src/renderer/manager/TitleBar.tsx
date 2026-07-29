import type { ReactElement } from 'react'
import type { Theme } from '../theme'

// 自绘标题栏（frame:false 后替代原生框）：
// 整条栏可拖拽（.app-drag），按钮区 .app-no-drag 保证可点击。
// 配色走 theme：底与 bgApp 融合、标题用 accentText；按钮用主题协调的中性 hover，
// 关闭按钮 hover 变红是跨平台桌面惯例（简报允许的协调值）。
export default function TitleBar({ theme }: { theme: Theme }): ReactElement {
  const btn =
    'app-no-drag flex h-9 w-11 items-center justify-center text-slate-600 transition-colors hover:bg-black/10'
  return (
    <div
      className={`app-drag flex h-9 shrink-0 items-center justify-between border-b border-black/10 pl-4 ${theme.bgApp}`}
    >
      <span className={`select-none text-sm font-semibold tracking-wide ${theme.accentText}`}>
        Vocall
      </span>
      <div className="flex">
        <button
          type="button"
          title="最小化"
          aria-label="最小化"
          className={btn}
          onClick={() => void window.vocall.winMinimize()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
        </button>
        <button
          type="button"
          title="最大化 / 还原"
          aria-label="最大化"
          className={btn}
          onClick={() => void window.vocall.winMaximize()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
          </svg>
        </button>
        <button
          type="button"
          title="关闭（隐藏到托盘）"
          aria-label="关闭"
          className="app-no-drag flex h-9 w-11 items-center justify-center text-slate-600 transition-colors hover:bg-rose-500 hover:text-white"
          onClick={() => void window.vocall.winClose()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="1.5" y1="1.5" x2="10.5" y2="10.5" />
            <line x1="10.5" y1="1.5" x2="1.5" y2="10.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}
