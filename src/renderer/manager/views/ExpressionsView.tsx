import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { Expression } from '../../../shared/ipc-types'

export default function ExpressionsView(): ReactElement {
  const [list, setList] = useState<Expression[]>([])
  const [plain, setPlain] = useState('')
  const [advanced, setAdvanced] = useState('')
  const [example, setExample] = useState('')

  const reload = async (): Promise<void> => {
    setList(await window.tasymize.listExpressions())
  }
  useEffect(() => { void reload() }, [])

  const add = async (): Promise<void> => {
    if (!plain || !advanced) return
    await window.tasymize.addExpression({ plain, advanced, example, topic: null, source: '手动' })
    setPlain(''); setAdvanced(''); setExample('')
    await reload()
  }

  const remove = async (id: number): Promise<void> => {
    await window.tasymize.deleteExpression(id)
    await reload()
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">表达库（{list.length}）</h2>
      <div className="mb-6 grid grid-cols-3 gap-2">
        <input value={plain} onChange={(e) => setPlain(e.target.value)} placeholder="普通词 important" className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none" />
        <input value={advanced} onChange={(e) => setAdvanced(e.target.value)} placeholder="高级表达 plays a pivotal role in" className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none" />
        <input value={example} onChange={(e) => setExample(e.target.value)} placeholder="雅思例句（可选）" className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none" />
      </div>
      <button onClick={() => void add()} className="mb-6 rounded-lg bg-emerald-500/80 px-4 py-2 text-sm font-medium hover:bg-emerald-500">新增表达</button>
      <ul className="space-y-2">
        {list.map((e) => (
          <li key={e.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <span className="text-slate-400">{e.plain}</span>
              <span className="mx-2 text-slate-600">→</span>
              <span className="text-emerald-300">{e.advanced}</span>
            </div>
            <button onClick={() => void remove(e.id)} className="text-xs text-rose-400 hover:text-rose-300">删除</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
