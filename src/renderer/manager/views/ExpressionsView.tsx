import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { VocabItem } from '../../../shared/ipc-types'

export default function ExpressionsView(): ReactElement {
  const [list, setList] = useState<VocabItem[]>([])
  const [word, setWord] = useState('')
  const [meaning, setMeaning] = useState('')
  const [example, setExample] = useState('')

  const reload = async (): Promise<void> => {
    setList(await window.tasymize.listVocab())
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

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">生词库（{list.length}）</h2>
      <div className="mb-6 grid grid-cols-3 gap-2">
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="生词 abandon" className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none" />
        <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="释义 放弃；抛弃" className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none" />
        <input value={example} onChange={(e) => setExample(e.target.value)} placeholder="雅思例句（可选）" className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none" />
      </div>
      <button onClick={() => void add()} className="mb-6 rounded-lg bg-emerald-500/80 px-4 py-2 text-sm font-medium hover:bg-emerald-500">新增生词</button>
      <ul className="space-y-2">
        {list.map((e) => (
          <li key={e.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <span className="text-slate-400">{e.word}</span>
              <span className="mx-2 text-slate-600">→</span>
              <span className="text-emerald-300">{e.meaning}</span>
            </div>
            <button onClick={() => void remove(e.id)} className="text-xs text-rose-400 hover:text-rose-300">删除</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
