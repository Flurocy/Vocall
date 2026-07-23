import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import ExpressionsView from './views/ExpressionsView'
import SettingsView from './views/SettingsView'
import { getTheme, getFontSize } from '../theme'
import type { Theme } from '../theme'

export default function App(): ReactElement {
  const [tab, setTab] = useState<'vocab' | 'settings'>('vocab')
  const [theme, setTheme] = useState<Theme>(() => getTheme())
  const [fontSize, setFontSize] = useState<string>(() => getFontSize())

  // Tailwind 字号是 rem（相对根元素），除顶层容器 style 外还需同步根元素字号，
  // 否则容器 fontSize 对 rem 类不生效
  useEffect(() => {
    document.documentElement.style.fontSize = fontSize
  }, [fontSize])

  useEffect(() => {
    void window.tasymize.getSettings().then((s) => {
      setTheme(getTheme(s.theme))
      setFontSize(getFontSize(s.font_size))
    })
  }, [])

  // SettingsView 改主题/字号后即时生效（lift state：外观状态由 App 持有）
  const onSettingChanged = (key: string, value: string): void => {
    if (key === 'theme') setTheme(getTheme(value))
    else if (key === 'font_size') setFontSize(getFontSize(value))
  }

  const navBtn = (active: boolean): string =>
    `mb-2 block w-full rounded-lg px-3 py-2 text-left text-sm ${
      active ? `${theme.accentBg} ${theme.accentText}` : 'text-slate-300 hover:bg-white/5'
    }`

  return (
    // 顶层 fontSize 供 em 级联；日后若做整窗 GUI 缩放，在此容器加 transform scale 即可
    <div className="flex h-screen bg-slate-950 text-slate-100" style={{ fontSize }}>
      <nav className="w-44 border-r border-white/10 p-4">
        <h1 className={`mb-6 text-lg font-bold ${theme.accentText}`}>Tasymize</h1>
        <button onClick={() => setTab('vocab')} className={navBtn(tab === 'vocab')}>生词库</button>
        <button onClick={() => setTab('settings')} className={navBtn(tab === 'settings')}>设置</button>
      </nav>
      <main className="flex-1 overflow-auto p-6">
        {tab === 'vocab'
          ? <ExpressionsView theme={theme} />
          : <SettingsView theme={theme} onSettingChanged={onSettingChanged} />}
      </main>
    </div>
  )
}
