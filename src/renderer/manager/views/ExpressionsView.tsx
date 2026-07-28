import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { VocabItem } from '../../../shared/ipc-types'
import type { Theme } from '../../theme'
import { playWord } from '../../playWord'
import AiGenModal from './AiGenModal'

// 剥 Electron IPC 包装前缀：err.message 形如
// "Error invoking remote method 'vocab:add': Error: 「x」已在生词库中..."，
// 只留内层真正原因给用户看。
const errMsg = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).replace(
    /^Error invoking remote method '[^']+':\s*Error:\s*/,
    ''
  )

// 现代简洁风：输入区与列表统一卡片化（白底半透 + 细边 + 圆角 + 轻投影），
// 留白加大、hover 有反馈；空态给明确引导。配色全部走 theme / 中性色。
export default function ExpressionsView({ theme }: { theme: Theme }): ReactElement {
  const [list, setList] = useState<VocabItem[]>([])
  // 易忘词标记：id→forgotCount（在 SRS 状态里，VocabItem 不含），缺省当 0
  const [forgotMap, setForgotMap] = useState<Record<number, number>>({})
  const [word, setWord] = useState('')
  const [meaning, setMeaning] = useState('')
  const [example, setExample] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set()) // 批量勾选
  const [aiGenOpen, setAiGenOpen] = useState(false) // AI 主题生成 modal 开关
  // AI 翻译（功能 B）：word 框旁小按钮调 translate，结果填回 meaning/example，用户过目后复用现有「新增生词」入库。
  // usedAi：本次 add 是否源自 AI 翻译（用户改 word 视作换词，清除标记；改 meaning/example 不清——微调 AI 结果仍算 AI 翻译）。
  const [aiTranslating, setAiTranslating] = useState(false)
  const [usedAi, setUsedAi] = useState(false)
  const [aiMsg, setAiMsg] = useState<{ kind: 'ok' | 'err' | 'busy'; text: string } | null>(null)

  const reload = async (): Promise<void> => {
    setList(await window.tasymize.listVocab())
    setForgotMap(await window.tasymize.getForgotCounts())
    setChecked(new Set()) // 刷新后清空勾选（被删的 id 已失效）
  }
  useEffect(() => { void reload() }, [])

  const add = async (): Promise<void> => {
    if (!word || !meaning) return
    try {
      await window.tasymize.addVocab({ word, meaning, example, topic: null, source: usedAi ? 'AI翻译' : '手动' })
    } catch (err) {
      // 入库失败（如同词重复被主进程拦截）：inline 报错并保留表单输入，用户可改词重试
      setAiMsg({ kind: 'err', text: errMsg(err) })
      return
    }
    // 只有成功才清空表单 + 刷新列表
    setWord(''); setMeaning(''); setExample('')
    setUsedAi(false)
    setAiMsg(null)
    await reload()
  }

  // AI 翻译：读 word 框值，调后端 translate，成功填入 meaning/example 让用户过目。
  // 错误（key 没配/AI 失败/解析错）inline 文字提示，跟设置页 ai:test 同风格。
  const aiTranslate = async (): Promise<void> => {
    const w = word.trim()
    if (!w) {
      setAiMsg({ kind: 'err', text: '请先在生词框输入要翻译的词' })
      return
    }
    setAiTranslating(true)
    setAiMsg({ kind: 'busy', text: '翻译中…' })
    try {
      const r = await window.tasymize.translate(w)
      setMeaning(r.meaning)
      setExample(r.example)
      setUsedAi(true)
      setAiMsg({ kind: 'ok', text: '已填入释义与例句，确认后点「新增生词」入库' })
    } catch (err) {
      setAiMsg({ kind: 'err', text: errMsg(err) })
    } finally {
      setAiTranslating(false)
    }
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
    if (!window.confirm(`删除勾选的 ${checked.size} 条生词？将移到回收站，可还原。`)) return
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
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800">{e.word}</span>
            <button
              onClick={() => void playWord(e.word)}
              aria-label={`朗读 ${e.word}`}
              title="朗读"
              className="shrink-0 text-slate-400 transition hover:text-slate-600"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H3v6h3l5 4z" />
                <path d="M16 9a3 3 0 0 1 0 6" />
                <path d="M19 6a7 7 0 0 1 0 12" />
              </svg>
            </button>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${statusBadge(e.status).cls}`}>
              {statusBadge(e.status).label}
            </span>
            {(forgotMap[e.id] ?? 0) > 0 && (
              <span className="shrink-0 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-600">
                已忘{forgotMap[e.id]}
              </span>
            )}
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
      <header className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">生词库</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            共 {list.length} 条 · 在学 {active.length} · 待学 {pending.length} · 已掌握 {mastered.length}
          </span>
          {/* AI 主题生成入口（功能 A）：accentSolid 强调按钮，点击开 modal */}
          <button
            onClick={() => setAiGenOpen(true)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${theme.accentSolid} ${theme.accentSolidHover}`}
          >
            AI 主题生成
          </button>
        </div>
      </header>

      {/* 新增卡片：word 框旁内嵌「AI 翻译」小按钮（功能 B 入口）；底部 inline 显示翻译结果消息 */}
      <section className="mb-6 rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm">
        {/* 两行布局：第一行 生词+AI译，第二行 释义+例句，避免 AI译按钮压到释义框 */}
        <div className="flex gap-2">
          <input
            value={word}
            onChange={(e) => { setWord(e.target.value); setUsedAi(false) }}
            placeholder="生词 abandon"
            className={`${inputCls} flex-1`}
          />
          {/* 自绘 tooltip：原生 title 是系统灰底不同步主题；group-hover 纯 CSS 控制，不用 JS state */}
          <div className="group relative shrink-0">
            <button
              onClick={() => void aiTranslate()}
              disabled={!word.trim() || aiTranslating}
              className="rounded-lg border border-black/10 px-2.5 py-2 text-xs text-slate-600 transition hover:bg-black/5 disabled:opacity-40"
            >
              {aiTranslating ? '…' : 'AI 译'}
            </button>
            <span
              className={`absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-black/10 px-2 py-1 text-xs shadow-md group-hover:block ${theme.bgCard} ${theme.accentText}`}
            >
              调用 AI 填入释义和例句
            </span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="释义 放弃；抛弃" className={inputCls} />
          <input value={example} onChange={(e) => setExample(e.target.value)} placeholder="雅思例句（可选）" className={inputCls} />
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          {aiMsg && (
            <span
              className={`text-xs ${
                aiMsg.kind === 'ok' ? theme.accentText : aiMsg.kind === 'err' ? 'text-rose-600' : 'text-slate-500'
              }`}
            >
              {aiMsg.text}
            </span>
          )}
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

      {/* AI 主题生成 modal（功能 A 入口）：onAdded 入库成功后 reload 列表；
          有重复词被跳过时复用 aiMsg 提示（modal 已关闭，提示必须在本页显示） */}
      {aiGenOpen && (
        <AiGenModal
          theme={theme}
          onClose={() => setAiGenOpen(false)}
          onAdded={(added, skipped) => {
            if (skipped > 0) {
              setAiMsg({ kind: 'ok', text: `已加入 ${added} 条，跳过 ${skipped} 条重复词` })
            }
            void reload()
          }}
        />
      )}
    </div>
  )
}
