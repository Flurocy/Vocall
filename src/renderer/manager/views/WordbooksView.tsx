import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { Theme } from '../../theme'

interface WordbookMeta { id: string; name: string; count: number; desc: string }

// 词书页：每本词书一张卡（名称/词数/简介/按钮）。
// "已加入"判断：生词库里存在该 book 的词即视为已加入——与主进程
// addWordbookToPlan 的幂等判断（listVocab().some(v => v.book === bookId)）一致。
// 注意：移除只删该书仍为 new 的词，learning/review 中的保留（用户已在学），
// 所以"移除"后若该书还有词在学，卡片仍显示"已加入"，此时再点加入是 no-op，
// 等剩余词学完/毕业删净后自然回到未加入态。
export default function WordbooksView({ theme }: { theme: Theme }): ReactElement {
  const [books, setBooks] = useState<WordbookMeta[]>([])
  const [joined, setJoined] = useState<Set<string>>(new Set())
  // 防连点：正在执行 IPC 的那本词书 id
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = async (): Promise<void> => {
    const [bs, vocab] = await Promise.all([
      window.tasymize.listWordbooks(),
      window.tasymize.listVocab(),
    ])
    setBooks(bs)
    setJoined(new Set(vocab.map((v) => v.book).filter((b): b is string => b !== null)))
  }
  useEffect(() => { void reload() }, [])

  const toggle = async (b: WordbookMeta): Promise<void> => {
    setBusyId(b.id)
    try {
      if (joined.has(b.id)) await window.tasymize.removeWordbook(b.id)
      else await window.tasymize.addWordbook(b.id)
    } finally {
      setBusyId(null)
    }
    await reload()
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">词书</h2>
        <span className="text-sm text-slate-500">共 {books.length} 本</span>
      </header>

      {books.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-black/15 bg-white/40 px-6 py-12 text-center">
          <p className="text-sm text-slate-500">还没有可用词书（data/wordbooks 目录为空）</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {books.map((b) => {
            const isJoined = joined.has(b.id)
            return (
              <li
                key={b.id}
                className="rounded-2xl border border-black/10 bg-white/60 p-5 shadow-sm transition hover:bg-white/80"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-medium text-slate-800">{b.name}</h3>
                      <span className={`shrink-0 text-xs ${theme.accentText}`}>{b.count} 词</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{b.desc}</p>
                  </div>
                  <button
                    onClick={() => void toggle(b)}
                    disabled={busyId === b.id}
                    className={
                      isJoined
                        ? 'shrink-0 rounded-lg border border-black/10 px-4 py-2 text-sm text-slate-600 transition hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50'
                        : `shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${theme.accentSolid} ${theme.accentSolidHover} disabled:opacity-50`
                    }
                  >
                    {isJoined ? '已加入 · 移除' : '加入学习计划'}
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
