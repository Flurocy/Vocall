import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { TrashEntry, VocabItem } from '../../../shared/ipc-types'
import type { Theme } from '../../theme'

// 回收站：软删除词的暂存区。仿 ExpressionsView 卡片化风格（白底半透+细边+圆角+轻投影），
// 列表展示 word/meaning/status 徽标 + 删除时间；每条可还原/彻底删除，顶部可一键清空。
// listTrash 后端已按 deletedAt 倒序返回（最近删的在上），前端直接渲染。
export default function TrashView({ theme }: { theme: Theme }): ReactElement {
  const [list, setList] = useState<TrashEntry[]>([])

  const reload = async (): Promise<void> => {
    setList(await window.vocall.listTrash())
  }
  useEffect(() => { void reload() }, [])

  const restore = async (id: number): Promise<void> => {
    await window.vocall.restore(id)
    await reload()
  }

  // 彻底删除：从回收站真删 + 清对应 srsState，不可恢复，需 confirm。
  const purge = async (id: number): Promise<void> => {
    if (!window.confirm('彻底删除这个词？不可恢复。')) return
    await window.vocall.purge(id)
    await reload()
  }

  // 一键清空：清空整个回收站 + 删所有对应 srsState，需 confirm。
  const clearAll = async (): Promise<void> => {
    if (list.length === 0) return
    if (!window.confirm('彻底清空所有已删除的词？此操作不可恢复。')) return
    await window.vocall.clearTrash()
    await reload()
  }

  // 复用 ExpressionsView 四态徽标配色（learning=accent/review=emerald/mastered=amber/new=slate）
  const statusBadge = (s: VocabItem['status']): { label: string; cls: string } =>
    s === 'learning'
      ? { label: '学习中', cls: `${theme.accentBg} ${theme.accentText}` }
      : s === 'review'
        ? { label: '复习中', cls: 'bg-emerald-500/15 text-emerald-700' }
        : s === 'mastered'
          ? { label: '已掌握', cls: 'bg-amber-500/15 text-amber-700' }
          : { label: '新词', cls: 'bg-slate-500/10 text-slate-600' }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">回收站</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">共 {list.length} 条</span>
          <button
            onClick={() => void clearAll()}
            disabled={list.length === 0}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-slate-600 transition hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-40"
          >
            清空回收站
          </button>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-black/15 bg-white/40 px-6 py-12 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 text-slate-400">
            <path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" />
          </svg>
          <p className="text-sm text-slate-500">回收站是空的</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {list.map((e) => {
            const b = statusBadge(e.item.status)
            return (
              <li
                key={e.item.id}
                className="group flex items-center justify-between rounded-xl border border-black/10 bg-white/60 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:bg-white/80 hover:shadow"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-slate-800">{e.item.word}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${b.cls}`}>
                        {b.label}
                      </span>
                      <span className={`truncate text-sm ${theme.accentText}`}>{e.item.meaning}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      删除于 {new Date(e.deletedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {/* 常驻浅灰可见（skill UX：hover-only 隐藏重要操作影响可发现性） */}
                <div className="ml-4 flex shrink-0 items-center gap-1 opacity-45 transition group-hover:opacity-100">
                  <button
                    onClick={() => void restore(e.item.id)}
                    className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-700"
                  >
                    还原
                  </button>
                  <button
                    onClick={() => void purge(e.item.id)}
                    className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-rose-500/10 hover:text-rose-600"
                  >
                    彻底删除
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
