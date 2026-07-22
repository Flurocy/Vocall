import { useState } from 'react'
import type { ReactElement } from 'react'
import ExpressionsView from './views/ExpressionsView'
import SettingsView from './views/SettingsView'

export default function App(): ReactElement {
  const [tab, setTab] = useState<'expr' | 'settings'>('expr')
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <nav className="w-44 border-r border-white/10 p-4">
        <h1 className="mb-6 text-lg font-bold text-emerald-300">Tasymize</h1>
        <button onClick={() => setTab('expr')} className={`mb-2 block w-full rounded-lg px-3 py-2 text-left text-sm ${tab === 'expr' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-white/5'}`}>表达库</button>
        <button onClick={() => setTab('settings')} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${tab === 'settings' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-white/5'}`}>设置</button>
      </nav>
      <main className="flex-1 overflow-auto p-6">
        {tab === 'expr' ? <ExpressionsView /> : <SettingsView />}
      </main>
    </div>
  )
}
