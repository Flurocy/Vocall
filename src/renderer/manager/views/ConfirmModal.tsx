import type { ReactElement } from 'react'
import type { Theme } from '../../theme'

// 自绘确认弹窗：替代 window.confirm（系统原生弹窗无法跟随主题，且与自绘 UI 风格割裂）。
// 用法：useState 存 {message, onOk}，点确认时调用 onOk 并关闭。遮罩点击=取消。
// danger=true 用于删除/清空等破坏性操作（确认按钮红色），否则走主题 accent。
export default function ConfirmModal({ theme, message, danger = true, onOk, onCancel }: {
  theme: Theme
  message: string
  danger?: boolean
  onOk: () => void
  onCancel: () => void
}): ReactElement {
  return (
    // 遮罩：点击空白处取消（等同原生 confirm 的"取消"语义）
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onClick={onCancel}
    >
      {/* 卡片：stopPropagation 防点卡片本身触发遮罩取消 */}
      <div
        className={`w-full max-w-xs rounded-2xl border border-black/10 ${theme.bgCard} p-5 shadow-2xl backdrop-blur-md`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm leading-relaxed text-slate-700">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-black/10 px-3.5 py-1.5 text-sm text-slate-600 transition hover:bg-black/5"
          >
            取消
          </button>
          <button
            autoFocus
            onClick={onOk}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              danger
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : `${theme.accentSolid} ${theme.accentSolidHover}`
            }`}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
