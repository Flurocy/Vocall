import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import TitleBar from './TitleBar'
import ExpressionsView from './views/ExpressionsView'
import WordbooksView from './views/WordbooksView'
import TrashView from './views/TrashView'
import StatsView from './views/StatsView'
import SettingsView from './views/SettingsView'
import PolishView from './views/PolishView'
import { getTheme, getFontSize } from '../theme'
import type { Theme } from '../theme'

export default function App(): ReactElement {
  const [tab, setTab] = useState<'vocab' | 'wordbooks' | 'polish' | 'stats' | 'settings' | 'trash'>('vocab')
  const [theme, setTheme] = useState<Theme>(() => getTheme())
  const [fontSize, setFontSize] = useState<string>(() => getFontSize())

  // Tailwind 字号是 rem（相对根元素），除顶层容器 style 外还需同步根元素字号，
  // 否则容器 fontSize 对 rem 类不生效
  useEffect(() => {
    document.documentElement.style.fontSize = fontSize
  }, [fontSize])

  useEffect(() => {
    void window.vocall.getSettings().then((s) => {
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
    `mb-1.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
      active ? `${theme.accentBg} ${theme.accentText} font-medium` : 'text-slate-600 hover:bg-black/5'
    }`

  // 导航项（图标 = 16px 线性 SVG，stroke currentColor 随激活态变色）
  const iconCls = 'h-4 w-4 shrink-0'
  const NAV_ITEMS = [
    {
      id: 'vocab' as const, label: '生词库',
      icon: (
        <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 6.5C10.5 5 8 4.5 4.5 4.5v15c3.5 0 6 .5 7.5 2 1.5-1.5 4-2 7.5-2v-15c-3.5 0-6 .5-7.5 2z" />
          <path d="M12 6.5v15" />
        </svg>
      ),
    },
    {
      id: 'wordbooks' as const, label: '词书',
      icon: (
        <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 4v16" /><path d="M9.5 4v16" /><path d="m13.5 5 4.5 15" />
        </svg>
      ),
    },
    {
      id: 'polish' as const, label: '表达教练',
      icon: (
        <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      ),
    },
    {
      id: 'trash' as const, label: '回收站',
      icon: (
        <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16" /><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
          <path d="m6 7 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
        </svg>
      ),
    },
    {
      id: 'stats' as const, label: '统计',
      icon: (
        <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" />
        </svg>
      ),
    },
    {
      id: 'settings' as const, label: '设置',
      icon: (
        <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h9" /><circle cx="16.5" cy="7" r="2.2" />
          <path d="M20 17h-9" /><circle cx="7.5" cy="17" r="2.2" />
        </svg>
      ),
    },
  ]

  return (
    // 顶层 fontSize 供 em 级联；日后若做整窗 GUI 缩放，在此容器加 transform scale 即可
    // 纵向布局：自绘标题栏置顶（frame:false），下方为原侧栏+内容
    <div className={`relative flex h-screen flex-col ${theme.bgApp} text-slate-800`} style={{ fontSize }}>
      {/* 氛围光：窗口顶部一抹主题色径向微渐变，给纯色底加"光感"（克制，不喧宾夺主）。
          颜色走 theme.glow（rgba JS 值，inline style 不受 Tailwind JIT 字面量约束） */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-80"
        style={{ background: `radial-gradient(65% 100% at 50% 0%, ${theme.glow}, transparent 72%)` }}
      />
      <TitleBar theme={theme} />
      <div className="relative flex min-h-0 flex-1">
        <nav className="w-44 border-r border-black/10 p-4 pt-5">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} onClick={() => setTab(item.id)} className={navBtn(tab === item.id)}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        {/* manager-scroll 自定义滚动条：currentColor=主题 accentText，换肤自动跟随 */}
        <main className={`manager-scroll flex-1 overflow-auto p-6 ${theme.accentText}`}>
          {tab === 'vocab'
            ? <ExpressionsView theme={theme} />
            : tab === 'wordbooks'
              ? <WordbooksView theme={theme} />
              : tab === 'polish'
                ? <PolishView theme={theme} />
                : tab === 'stats'
                  ? <StatsView theme={theme} />
                  : tab === 'trash'
                    ? <TrashView theme={theme} />
                    : <SettingsView theme={theme} onSettingChanged={onSettingChanged} />}
        </main>
      </div>
    </div>
  )
}
