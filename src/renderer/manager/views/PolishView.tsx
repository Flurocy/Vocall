import { useState } from 'react'
import type { ReactElement } from 'react'
import type { PolishMode, PolishResult } from '../../../shared/ipc-types'
import type { Theme } from '../../theme'
import { CircleNotch, Copy, Check } from '@phosphor-icons/react'

// 剥 Electron IPC 包装前缀（同 ExpressionsView 模式）
const errMsg = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).replace(
    /^Error invoking remote method '[^']+':\s*Error:\s*/,
    ''
  )

// A1 表达教练：句子优化（写作/口语）+ 中译英。
// 单页三模式分段切换；背词联动默认关、仅写作/口语可选（翻译不被词库绑架）。
// 结果区：1-2 个版本卡片，命中"在学词"的词形高亮 ✦（后验程序匹配，不依赖 AI 自报）。
// 现代简洁卡片风：白底半透 + 细边 + 圆角 + 轻投影，配色全走 theme / 中性色。

const MODES: { id: PolishMode; label: string; hint: string; placeholder: string }[] = [
  { id: 'writing', label: '写作优化', hint: '更正式 · 连贯 · 学术', placeholder: '输入想优化的英文句子（雅思写作向）…' },
  { id: 'speaking', label: '口语优化', hint: '更自然 · 地道 · 像母语者', placeholder: '输入想优化的英文句子（日常口语向）…' },
  { id: 'translate', label: '中译英', hint: '地道英文 · 非中式直译', placeholder: '输入中文句子，翻译成地道英文…' },
]

// 把文本里命中 usedWords 的词形拆段高亮。复用与后端一致的"词干"思路做前端拆分：
// 逐 token 判断其词干是否命中任一 usedWord 词干，命中则包 <mark>。
// 只做展示高亮，逻辑与后端 matchUsedWords 相互独立（后端给词表，前端负责可视化）。
function stemOf(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z'-]+$/g, '')
  const suffixes = ['ation', 'ition', 'tion', 'ing', 'ies', 'ers', 'ed', 'es', 'er', 'ly', 'al', 's']
  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      const base = w.slice(0, -suf.length)
      return suf === 'ies' ? base + 'y' : base
    }
  }
  return w
}

/** 把句子按"命中词 / 普通文本"切成段，命中段标 hit=true */
function splitHighlight(text: string, usedWords: string[]): { str: string; hit: boolean }[] {
  if (usedWords.length === 0) return [{ str: text, hit: false }]
  const targets = new Set(usedWords.map((w) => stemOf(w.split(/\s+/)[0] ?? w)))
  // 用捕获组保留分隔 token：交替得到 [非词, 词, 非词, 词, ...]
  const parts = text.split(/([A-Za-z][A-Za-z'-]*)/)
  return parts
    .filter((p) => p.length > 0)
    .map((p) => {
      const isWordToken = /^[A-Za-z]/.test(p)
      const hit = isWordToken && targets.has(stemOf(p))
      return { str: p, hit }
    })
}

export default function PolishView({ theme }: { theme: Theme }): ReactElement {
  const [mode, setMode] = useState<PolishMode>('writing')
  const [boost, setBoost] = useState(false) // 背词联动：默认关（用户决策：绝不强绑定）
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PolishResult | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const current = MODES.find((m) => m.id === mode)!

  // 切模式：清空旧结果/提示/复制态——旧模式的结果不该挂在新模式下（用户报 bug）。
  // 输入保留：同一句英文在写作/口语间对比着改是高频场景，留着省得重打。
  const switchMode = (m: PolishMode): void => {
    if (m === mode) return
    setMode(m)
    setResult(null)
    setMsg(null)
    setCopiedIdx(null)
  }

  const run = async (): Promise<void> => {
    const text = input.trim()
    if (!text) { setMsg({ kind: 'err', text: '请先输入内容' }); return }
    setBusy(true)
    setMsg(null)
    setResult(null)
    setCopiedIdx(null)
    try {
      const r = await window.vocall.polish(text, mode, boost)
      setResult(r)
      if (r.usedWords.length > 0) {
        setMsg({ kind: 'ok', text: `用上了你在学的 ${r.usedWords.length} 个词（已高亮 ✦）` })
      }
    } catch (err) {
      setMsg({ kind: 'err', text: errMsg(err) })
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string, idx: number): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((i) => (i === idx ? null : i)), 1500)
    } catch { /* 剪贴板失败静默 */ }
  }

  const segBtn = (active: boolean): string =>
    `flex-1 rounded-lg px-3 py-2 text-sm transition ${
      active ? `${theme.accentBg} ${theme.accentText} font-medium` : 'text-slate-600 hover:bg-black/5'
    }`

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h2 className="text-xl font-semibold">表达教练</h2>
        <p className="mt-1 text-sm text-slate-600">优化你的英文句子，或把中文翻成地道英文</p>
      </header>

      {/* 输入卡片：模式分段切换 + 联动开关 + 输入框 + 优化按钮 */}
      <section className="mb-6 rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm">
        {/* 模式分段切换 */}
        <div className="flex gap-1.5 rounded-xl bg-black/[0.04] p-1.5">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => switchMode(m.id)} className={segBtn(mode === m.id)}>
              <div>{m.label}</div>
              <div className={`mt-0.5 text-[10px] font-normal ${mode === m.id ? '' : 'text-slate-400'}`}>{m.hint}</div>
            </button>
          ))}
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={current.placeholder}
          rows={3}
          // 关浏览器自带拼写检查：学语言场景下红波浪线干扰输入，"对不对"交给 AI 判断而非浏览器字典
          spellCheck={false}
          className="mt-3 w-full resize-y rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-black/20 focus:bg-white"
        />

        <div className="mt-3 flex items-center justify-between">
          {/* 背词联动开关：仅写作/口语显示（翻译不被词库绑架）。默认关。 */}
          {mode !== 'translate' ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={boost}
                onChange={(e) => setBoost(e.target.checked)}
                className={`h-4 w-4 ${theme.accentColor}`}
              />
              <span>✦ 优先用在学的词</span>
              <span className="text-xs text-slate-400">（自然优先，不硬套）</span>
            </label>
          ) : (
            <span className="text-xs text-slate-400">翻译模式下不做背词联动</span>
          )}

          <button
            onClick={() => void run()}
            disabled={busy || !input.trim()}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${theme.accentSolid} ${theme.accentSolidHover}`}
          >
            {busy ? <CircleNotch size={14} className="animate-spin" /> : null}
            {busy ? '优化中…' : '优化'}
          </button>
        </div>

        {/* inline 消息（剥 IPC 前缀） */}
        {msg && (
          <div className={`mt-3 text-xs ${msg.kind === 'ok' ? theme.accentText : 'text-rose-600'}`}>
            {msg.text}
          </div>
        )}
      </section>

      {/* 结果区：1-2 个版本卡片 */}
      {result && (
        <div className="space-y-2.5">
          {result.versions.map((v, i) => (
            <div
              key={i}
              className="group rounded-xl border border-black/10 bg-white/60 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:bg-white/80 hover:shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="leading-relaxed text-slate-800">
                    {splitHighlight(v.en, result.usedWords).map((seg, j) =>
                      seg.hit ? (
                        <mark
                          key={j}
                          className={`rounded bg-transparent px-0.5 font-semibold ${theme.accentText}`}
                          title="你在学的词"
                        >
                          {seg.str}
                        </mark>
                      ) : (
                        <span key={j}>{seg.str}</span>
                      ),
                    )}
                  </p>
                  {/* 中文意思：帮用户核对这句英文到底什么意思（小字灰，不抢英文主体） */}
                  {v.zh && <p className="mt-1 text-sm text-slate-500">{v.zh}</p>}
                </div>
                <button
                  onClick={() => void copy(v.en, i)}
                  title="复制英文"
                  aria-label="复制该版本英文"
                  className="mt-0.5 shrink-0 rounded-md p-1.5 text-slate-400 opacity-45 transition hover:bg-black/5 hover:text-slate-600 group-hover:opacity-100"
                >
                  {copiedIdx === i ? <Check size={15} weight="bold" className={theme.accentText} /> : <Copy size={15} />}
                </button>
              </div>
              {result.versions.length > 1 && (
                <div className="mt-1.5 text-[10px] text-slate-400">版本 {i + 1}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 空态引导：还没跑过时 */}
      {!result && !busy && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-black/15 bg-white/40 px-6 py-12 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 text-slate-400">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          <p className="text-sm text-slate-600">输入句子，点「优化」看 AI 怎么改得更地道</p>
          {mode !== 'translate' && (
            <p className="mt-1 text-xs text-slate-400">勾选「✦ 优先用在学的词」可顺势练到正在背的词</p>
          )}
        </div>
      )}
    </div>
  )
}
