import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Theme } from '../../theme'
import type { Sense } from '../../../shared/ipc-types'

// 主题词组生成 modal（功能 A 入口）：输主题/选预设 → AI 生成 30 个 → 勾选入库。
// 入库参数约定（计划 §5）：{status:'new', topic:主题文本, source:'AI主题:'+主题文本}。
// 错误提示 inline 文字（设置页 ai:test 同风格），不用 window.alert。
// Tailwind v4 JIT：所有 hover 类必须是字面量，theme 里已预先定义 accentBgHover/accentSolidHover。

interface VocabEntry {
  word: string
  meaning: string
  example: string
  senses?: Sense[] // 一词多义（AI 生成带入，入库透传）
}

interface Props {
  theme: Theme
  onClose: () => void
  // 入库完成后父 reload 列表；透传 added/skipped 计数，skipped>0 时父页面展示
  // 「已加入 X 条，跳过 Y 条重复词」（modal 随即关闭，提示必须放父页面才看得见）
  onAdded: (added: number, skipped: number) => void
}

const QUICK_THEMES = ['教育', '科技', '环境', '社会', '文化', '健康']

type Msg = { kind: 'ok' | 'err' | 'busy'; text: string }

export default function AiGenModal({ theme, onClose, onAdded }: Props): ReactElement {
  const [themeText, setThemeText] = useState('')
  const [loading, setLoading] = useState(false) // AI 生成中
  const [adding, setAdding] = useState(false) // 批量入库中
  const [results, setResults] = useState<VocabEntry[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [msg, setMsg] = useState<Msg | null>(null)
  // 已成功入库的下标（跨重试累积）：addVocab 中途失败时已入库的不回滚，
  // 重试「加入所选」必须跳过这些下标，避免重复词。generate 时清空（换了一批结果）。
  const doneRef = useRef<Set<number>>(new Set())

  // Esc 关闭（loading/adding 中不响应，防误关丢失 30 词待选）；deps 跟随忙闲态切换以读到最新值
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !loading && !adding) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, adding, onClose])

  const generate = async (): Promise<void> => {
    const t = themeText.trim()
    if (!t) {
      setMsg({ kind: 'err', text: '请先输入或选择一个主题' })
      return
    }
    setLoading(true)
    setMsg({ kind: 'busy', text: '生成中…（AI 约需 10–30 秒，请勿关闭）' })
    setResults([])
    setChecked(new Set())
    setExpanded(new Set())
    doneRef.current = new Set() // 新一批结果，重置已入库下标
    try {
      const list = await window.vocall.generateTheme(t, 30)
      if (list.length === 0) {
        setMsg({ kind: 'err', text: 'AI 返回为空，换个主题或稍后重试' })
        return
      }
      setResults(list)
      setChecked(new Set(list.map((_, i) => i))) // 默认全选，用户可按需取消
      setMsg(null)
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setLoading(false)
    }
  }

  const toggle = (i: number): void => {
    setChecked((s) => {
      const ns = new Set(s)
      if (ns.has(i)) ns.delete(i); else ns.add(i)
      return ns
    })
  }
  const toggleExpand = (i: number): void => {
    setExpanded((s) => {
      const ns = new Set(s)
      if (ns.has(i)) ns.delete(i); else ns.add(i)
      return ns
    })
  }

  const allChecked = results.length > 0 && results.every((_, i) => checked.has(i))
  const toggleAll = (): void => {
    setChecked(allChecked ? new Set() : new Set(results.map((_, i) => i)))
  }

  const addSelected = async (): Promise<void> => {
    if (checked.size === 0) return
    const pending = [...checked].filter((i) => !doneRef.current.has(i))
    if (pending.length === 0) {
      // 全部已入库（用户重试时已无未完成项）——直接收尾
      setMsg(null)
      onAdded(0, 0)
      onClose()
      return
    }
    setAdding(true)
    setMsg({ kind: 'busy', text: `正在加入 ${pending.length} 条…` })
    const t = themeText.trim()
    try {
      // 批量入库：一次 IPC 整批提交（修逐词 invoke 往返卡顿）。主进程静默跳过
      // 撞库/回收站/批内重复的词，返回实际加入数；skipped = 想加数 − 实际加入数。
      const items = pending.map((i) => {
        const e = results[i]
        return {
          word: e.word,
          meaning: e.meaning,
          example: e.example,
          topic: t,
          source: `AI主题:${t}`,
          status: 'new' as const,
          ...(e.senses ? { senses: e.senses } : {}), // 一词多义透传（有才带）
        }
      })
      const added = await window.vocall.addVocabBatch(items)
      const skipped = pending.length - added
      pending.forEach((i) => doneRef.current.add(i)) // 本批全部处理完（成功或被跳过）
      // 跳过提示不在 modal 内 setMsg（onClose 同帧卸载看不见），透传计数由父页面 aiMsg 展示
      setMsg(null)
      onAdded(added, skipped)
      onClose()
    } catch (err) {
      // 批量是原子提交（内存组装后一次写盘），失败=整批未入，doneRef 不动，可整体重试
      setMsg({
        kind: 'err',
        text: `加入失败：${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setAdding(false)
    }
  }

  // loading/adding 中防误关（关闭即丢结果，体验差）。遮罩点击触发同路径。
  const handleClose = (): void => {
    if (loading || adding) return
    onClose()
  }

  const msgCls = (k: Msg['kind']): string =>
    k === 'ok' ? theme.accentText : k === 'err' ? 'text-rose-600' : 'text-slate-500'

  return (
    // 半透明遮罩 + backdrop-blur：点击空白关闭（loading 中禁用）
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className={`flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-black/10 ${theme.bgCard} p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">AI 主题词组生成</h3>
          <button
            onClick={handleClose}
            disabled={loading || adding}
            className="rounded-md px-2 py-1 text-slate-400 transition hover:bg-black/5 hover:text-slate-600 disabled:opacity-40"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 主题输入 + 6 个快捷话题（点击填入输入框；当前选中态用 accentBg 高亮） */}
        <div className="mb-3">
          <input
            value={themeText}
            onChange={(e) => setThemeText(e.target.value)}
            placeholder="输入主题，如：人工智能、城市交通、家庭教育"
            disabled={loading || adding}
            className="w-full rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-black/20 focus:bg-white disabled:opacity-60"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_THEMES.map((q) => {
              const selected = themeText === q
              return (
                <button
                  key={q}
                  onClick={() => setThemeText(q)}
                  disabled={loading || adding}
                  className={`rounded-full border px-3 py-1 text-xs transition disabled:opacity-40 ${
                    selected
                      ? `${theme.accentBg} ${theme.accentText} border-transparent`
                      : 'border-black/10 text-slate-600 hover:bg-black/5'
                  }`}
                >
                  {q}
                </button>
              )
            })}
          </div>
        </div>

        {/* 生成按钮 + inline 消息（错误用 rose、busy 中性灰、成功 accentText） */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void generate()}
            disabled={loading || adding || !themeText.trim()}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${theme.accentSolid} ${theme.accentSolidHover}`}
          >
            {loading ? '生成中…' : '生成 30 个'}
          </button>
          {msg && <span className={`text-sm ${msgCls(msg.kind)}`}>{msg.text}</span>}
        </div>

        {/* 结果列表：勾选 + word + meaning，点行展开 example。无结果时不渲染（避免空态噪声） */}
        {results.length > 0 && (
          <>
            <div className="mb-2 flex items-center justify-between rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm">
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  disabled={adding}
                  className={`h-4 w-4 ${theme.accentColor}`}
                />
                全选（{results.length}）
              </label>
              <button
                onClick={() => void addSelected()}
                disabled={checked.size === 0 || adding}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ${theme.accentSolid} ${theme.accentSolidHover}`}
              >
                {adding ? '加入中…' : `加入所选（${checked.size}）`}
              </button>
            </div>
            <ul className="space-y-1.5 overflow-y-auto pr-1">
              {results.map((e, i) => {
                const isChecked = checked.has(i)
                const isExpanded = expanded.has(i)
                return (
                  <li
                    key={`${e.word}-${i}`}
                    className="rounded-xl border border-black/10 bg-white/60 transition hover:bg-white/80"
                  >
                    <div className="flex items-center gap-2 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(i)}
                        disabled={adding}
                        className={`h-4 w-4 shrink-0 ${theme.accentColor}`}
                      />
                      <button
                        onClick={() => toggleExpand(i)}
                        className="flex min-w-0 flex-1 items-baseline justify-between gap-2 text-left"
                      >
                        <span className="word-font font-semibold tracking-wide text-slate-800">{e.word}</span>
                        <span className={`truncate text-sm ${theme.accentText}`}>{e.meaning}</span>
                      </button>
                      <button
                        onClick={() => toggleExpand(i)}
                        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-slate-400 transition hover:bg-black/5 hover:text-slate-600"
                      >
                        {isExpanded ? '收起' : '例句'}
                      </button>
                    </div>
                    {isExpanded && (
                      <p className="mx-3 mb-2 rounded-lg bg-black/5 px-3 py-2 text-xs leading-relaxed text-slate-600">
                        {e.example}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
