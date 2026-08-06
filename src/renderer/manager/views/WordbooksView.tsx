import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { Theme } from '../../theme'
import type { WordbookWord } from '../../../shared/ipc-types'

interface BookMeta { id: string; name: string; count: number; desc: string }

// 剥 Electron IPC 包装前缀（"Error invoking remote method '...': Error: 真实原因"），只留真实原因
const errMsg = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).replace(
    /^Error invoking remote method '[^']+':\s*Error:\s*/,
    ''
  )

// 词书 = 预置的现成词库（用户决策）：点进某本书 → 勾选想要的词 → 批量加入背诵库。
// 不整本接收、无"移除全书"概念；已在库的词标记"已在库"并禁选，防重复加入。
export default function WordbooksView({ theme }: { theme: Theme }): ReactElement {
  const [books, setBooks] = useState<BookMeta[]>([])
  const [openId, setOpenId] = useState<string | null>(null) // 当前点进的词书 id

  useEffect(() => {
    void window.vocall.listWordbooks().then(setBooks)
  }, [])

  if (openId) {
    const book = books.find((b) => b.id === openId)
    return <BookDetail theme={theme} bookId={openId} bookName={book?.name ?? ''} onBack={() => setOpenId(null)} />
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-2">
        <h2 className="text-xl font-semibold">词书</h2>
      </header>
      <p className="mb-4 text-sm text-slate-600">词书是预置的现成词库，点进一本，勾选想要的词加入背诵库。</p>
      {books.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-black/15 bg-white/40 px-6 py-12 text-center">
          <p className="text-sm text-slate-600">还没有可用词书（data/wordbooks 目录为空）</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {books.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => setOpenId(b.id)}
                className="block w-full rounded-2xl border border-black/10 bg-white/60 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-white/80 hover:shadow"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className={`font-medium ${theme.accentText}`}>{b.name}</h3>
                  <span className="shrink-0 text-xs text-slate-600">{b.count} 词</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{b.desc}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// 单本词书详情：全词列表 + 复选框 + 全选 + 批量加入
function BookDetail({ theme, bookId, bookName, onBack }: {
  theme: Theme; bookId: string; bookName: string; onBack: () => void
}): ReactElement {
  const [words, setWords] = useState<WordbookWord[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null) // 批量加入失败提示（撞词由主进程跳过，这里只兜非重复类错误）

  const load = async (): Promise<void> => {
    setWords(await window.vocall.getWordbookWords(bookId))
    setChecked(new Set())
  }
  useEffect(() => { void load() }, [bookId]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (w: string): void => {
    setChecked((s) => {
      const ns = new Set(s)
      if (ns.has(w)) ns.delete(w); else ns.add(w)
      return ns
    })
  }

  const selectable = words.filter((w) => !w.inLibrary && !w.inTrash)
  const allChecked = selectable.length > 0 && selectable.every((w) => checked.has(w.word))
  const toggleAll = (): void => {
    setChecked(allChecked ? new Set() : new Set(selectable.map((w) => w.word)))
  }

  const addSelected = async (): Promise<void> => {
    if (checked.size === 0) return
    try {
      const n = await window.vocall.addWordsToPlan(bookId, [...checked])
      setAdded(n)
      setErr(null)
      await load() // 刷新在库标记
    } catch (e) {
      // 非撞词类错误（撞词主进程已跳过）：inline 报错，勾选状态保留可重试
      setAdded(null)
      setErr(errMsg(e))
    }
  }

  const card = 'rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm'

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-black/5">
          ← 返回
        </button>
        <h2 className="text-xl font-semibold">{bookName}</h2>
      </div>

      <div className={`mb-4 flex items-center justify-between ${card}`}>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} className={`h-4 w-4 ${theme.accentColor}`} />
          全选（可加入 {selectable.length} 词）
        </label>
        <button
          onClick={() => void addSelected()}
          disabled={checked.size === 0}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${theme.accentSolid} ${theme.accentSolidHover}`}
        >
          加入所选（{checked.size}）
        </button>
      </div>

      {added !== null && <p className="mb-3 text-sm text-emerald-600">已加入 {added} 个词到背诵库</p>}
      {err !== null && <p className="mb-3 text-sm text-rose-600">加入失败：{err}</p>}

      <ul className="space-y-2">
        {words.map((w) => (
          <li key={w.word}>
            <label className={`flex items-start gap-3 rounded-xl border border-black/10 p-3 transition ${
              (w.inLibrary || w.inTrash) ? 'bg-black/5 opacity-60' : 'bg-white/60 hover:bg-white/80'
            }`}>
              <input
                type="checkbox"
                checked={checked.has(w.word)}
                disabled={w.inLibrary || w.inTrash}
                onChange={() => toggle(w.word)}
                className={`mt-1 h-4 w-4 ${theme.accentColor}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-slate-800">{w.word}</span>
                  {w.inLibrary && <span className="text-xs text-slate-600">已在库</span>}
                  {w.inTrash && <span className="text-xs text-rose-600">回收站</span>}
                </div>
                <div className="text-sm text-slate-600">{w.meaning}</div>
              </div>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
