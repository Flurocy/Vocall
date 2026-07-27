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

  // 复活：mastered 词回到 learning 队列立即可弹（生词库内单条操作）
  const revive = async (id: number): Promise<void> => {
    await window.tasymize.revive(id)
    await reload()
  }

  // 批量标为已掌握：勾选的词进 mastered 终态（不再弹窗）。
  // 与批量删除并列；语义中性（归档而非销毁），不需 confirm。
  const masterSelected = async (): Promise<void> => {
    if (checked.size === 0) return
    for (const id of checked) await window.tasymize.master(id)
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

  // 生命周期四态浅色徽标：new=slate 灰、learning=主题 accent、review=emerald 绿、mastered=amber 金
  // （mastered 用金色区别于 review 的浅绿，传递"已结业"的成就感）
  const statusBadge = (s: VocabItem['status']): { label: string; cls: string } =>
    s === 'learning'
      ? { label: '学习中', cls: `${theme.accentBg} ${theme.accentText}` }
      : s === 'review'
        ? { label: '复习中', cls: 'bg-emerald-500/15 text-emerald-700' }
        : s === 'mastered'
          ? { label: '已掌握', cls: 'bg-amber-500/15 text-amber-700' }
          : { label: '新词', cls: 'bg-slate-500/10 text-slate-600' }

  // 分界线可视化：会出现在弹窗的词(learning+review)排线上，
  // 待学习(new)排线下已掌握(mastered)再下一层——三段递进表达生命周期。
  // 组内按 id 升序保持稳定，避免删词/勾选时整列表乱跳。
  const sorted = [...list].sort((a, b) => a.id - b.id)
  const active = sorted.filter((e) => e.status === 'learning' || e.status === 'review')
  const pending = sorted.filter((e) => e.status === 'new')
  const mastered = sorted.filter((e) => e.status === 'mastered')

  // 单行渲染抽出来：三段共用，mastered 段通过 action 注入「重新背」按钮。
  // 右侧操作组整体 group-hover 显示，避免每段视觉不一致。
  const row = (e: VocabItem, action?: ReactElement): ReactElement => (
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
      <div className="ml-4 flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
        {action}
        <button
          onClick={() => void remove(e.id)}
          className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-rose-500/10 hover:text-rose-600"
        >
          删除
        </button>
      </div>
    </li>
  )

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">生词库</h2>
        <span className="text-sm text-slate-500">
          共 {list.length} 条 · 在学 {active.length} · 待学 {pending.length} · 已掌握 {mastered.length}
        </span>
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => void masterSelected()}
                disabled={checked.size === 0}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-slate-600 transition hover:border-amber-300 hover:bg-amber-500/10 hover:text-amber-700 disabled:opacity-40"
              >
                标为已掌握（{checked.size}）
              </button>
              <button
                onClick={() => void removeSelected()}
                disabled={checked.size === 0}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-slate-600 transition hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-40"
              >
                删除所选（{checked.size}）
              </button>
            </div>
          </div>
          <ul className="space-y-2.5">
            {/* 学习中 / 复习中：会出现在弹窗的词（分界线之上） */}
            {active.map((e) => row(e))}
            {/* 分界线：以下为待学习（new 队列，暂不弹窗） */}
            {active.length > 0 && pending.length > 0 && (
              <li className="my-1 flex items-center gap-3 px-1 text-xs text-slate-400">
                <div className="h-px flex-1 bg-black/10" />
                <span>待学习（{pending.length}）</span>
                <div className="h-px flex-1 bg-black/10" />
              </li>
            )}
            {/* 待学习（分界线之下） */}
            {pending.map((e) => row(e))}
            {/* 分界线：以下为已掌握（mastered 终态，不再弹窗；可「重新背」复活） */}
            {mastered.length > 0 && (
              <li className="my-1 flex items-center gap-3 px-1 text-xs text-amber-600/80">
                <div className="h-px flex-1 bg-amber-500/20" />
                <span>已掌握（{mastered.length}）</span>
                <div className="h-px flex-1 bg-amber-500/20" />
              </li>
            )}
            {/* 已掌握（带「重新背」按钮，emerald 暗示回到学习池） */}
            {mastered.map((e) => row(e, (
              <button
                onClick={() => void revive(e.id)}
                className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-700"
              >
                重新背
              </button>
            )))}
          </ul>
        </>
      )}
    </div>
  )
}
