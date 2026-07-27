import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { VocabItem } from '../../../shared/ipc-types'
import type { Theme } from '../../theme'

// 现代简洁风：输入区与列表统一卡片化（白底半透 + 细边 + 圆角 + 轻投影），
// 留白加大、hover 有反馈；空态给明确引导。配色全部走 theme / 中性色。
export default function ExpressionsView({ theme }: { theme: Theme }): ReactElement {
  const [list, setList] = useState<VocabItem[]>([])
  const [word, setWord] = useState('')
  const [meaning, setMeaning] = useState('')
  const [example, setExample] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set()) // 批量勾选

  const reload = async (): Promise<void> => {
    setList(await window.tasymize.listVocab())
    setChecked(new Set()) // 刷新后清空勾选（被删的 id 已失效）
  }
  useEffect(() => { void reload() }, [])

  const add = async (): Promise<void> => {
    if (!word || !meaning) return
    await window.tasymize.addVocab({ word, meaning, example, topic: null, source: '手动' })
    setWord(''); setMeaning(''); setExample('')
    await reload()
  }

  const remove = async (id: number): Promise<void> => {
    await window.tasymize.deleteVocab(id)
    await reload()
  }

  const toggle = (id: number): void => {
    setChecked((s) => {
      const ns = new Set(s)
      if (ns.has(id)) ns.delete(id); else ns.add(id)
      return ns
    })
  }
  const allChecked = list.length > 0 && list.every((e) => checked.has(e.id))
  const toggleAll = (): void => {
    setChecked(allChecked ? new Set() : new Set(list.map((e) => e.id)))
  }
  const removeSelected = async (): Promise<void> => {
    if (checked.size === 0) return
    if (!window.confirm(`删除勾选的 ${checked.size} 条生词？此操作不可撤销。`)) return
    for (const id of checked) await window.tasymize.deleteVocab(id)
    await reload()
  }

  const inputCls =
    'rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-black/20 focus:bg-white'

  // 生命周期三态浅色徽标：new=slate 灰、learning=主题 accent、review=emerald 绿
  const statusBadge = (s: VocabItem['status']): { label: string; cls: string } =>
    s === 'learning'
      ? { label: '学习中', cls: `${theme.accentBg} ${theme.accentText}` }
      : s === 'review'
        ? { label: '复习中', cls: 'bg-emerald-500/15 text-emerald-700' }
        : { label: '新词', cls: 'bg-slate-500/10 text-slate-600' }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">生词库</h2>
        <span className="text-sm text-slate-500">共 {list.length} 条</span>
      </header>

      {/* 新增卡片 */}
      <section className="mb-6 rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm">
        <div className="grid grid-cols-3 gap-3">
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="生词 abandon" className={inputCls} />
          <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="释义 放弃；抛弃" className={inputCls} />
          <input value={example} onChange={(e) => setExample(e.target.value)} placeholder="雅思例句（可选）" className={inputCls} />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => void add()}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${theme.accentSolid} ${theme.accentSolidHover}`}
          >
            新增生词
          </button>
        </div>
      </section>

      {/* 列表 / 空态 */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-black/15 bg-white/40 px-6 py-12 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 text-slate-400">
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 0 4 21.5z" />
            <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 1 1.5 1.5z" />
          </svg>
          <p className="text-sm text-slate-500">还没有生词，先在上方添加一条吧</p>
        </div>
      ) : (
        <>
          {/* 批量操作条 */}
          <div className="mb-3 flex items-center justify-between rounded-xl border border-black/10 bg-white/60 px-4 py-2.5 shadow-sm">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className={`h-4 w-4 ${theme.accentColor}`} />
              全选
            </label>
            <button
              onClick={() => void removeSelected()}
              disabled={checked.size === 0}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-slate-600 transition hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-40"
            >
              删除所选（{checked.size}）
            </button>
          </div>
          <ul className="space-y-2.5">
            {list.map((e) => (
              <li
                key={e.id}
                className="group flex items-center justify-between rounded-xl border border-black/10 bg-white/60 px-4 py-3 shadow-sm transition hover:bg-white/80 hover:shadow"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checked.has(e.id)}
                    onChange={() => toggle(e.id)}
                    className={`h-4 w-4 shrink-0 ${theme.accentColor}`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-slate-800">{e.word}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${statusBadge(e.status).cls}`}>
                        {statusBadge(e.status).label}
                      </span>
                      <span className={`truncate text-sm ${theme.accentText}`}>{e.meaning}</span>
                    </div>
                    {e.example ? (
                      <p className="mt-1 truncate text-xs text-slate-500">{e.example}</p>
                    ) : null}
                  </div>
                </div>
                <button
                  onClick={() => void remove(e.id)}
                  className="ml-4 shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-600"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
