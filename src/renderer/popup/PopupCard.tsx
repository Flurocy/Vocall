import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { VocabItem } from '../../shared/ipc-types'

// 音效：读设置里的 sound_file（接入位，空则用默认 pop.mp3）。
// 相对路径基于弹窗页面 URL（/popup/popup.html），'../<file>' 指向渲染资源根目录，
// dev 与 build 下都解析到 electron-vite 的 publicDir —— 即把音频放到
// src/renderer/public/pop.mp3 即可生效。也支持绝对路径（如 C:\sounds\pop.mp3）。
// 任何失败（文件缺失、解码失败、自动播放限制）都静默吞掉，不影响卡片。
async function playSound(): Promise<void> {
  try {
    const settings = await window.tasymize.getSettings()
    const file = settings.sound_file || 'pop.mp3'
    const isAbsolute = /^([a-zA-Z]:[\\/]|\/|file:)/.test(file)
    const url = isAbsolute ? `file:///${file.replace(/\\/g, '/')}` : `../${file}`
    const audio = new Audio(url)
    audio.volume = 0.6
    await audio.play().catch(() => {})
  } catch {
    /* 音效失败静默 */
  }
}

export default function PopupCard(): ReactElement | null {
  const [expr, setExpr] = useState<VocabItem | null>(null)
  const [revealed, setRevealed] = useState(false)
  const timers = useRef<number[]>([])

  const start = useCallback((e: VocabItem): void => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setExpr(e)
    setRevealed(false)
    // 注意：当前为硬编码，未与设置键 recall_delay_sec / popup_stay_sec 打通（Task 7 brief 要求保持硬编码）
    const recallMs = Number(/* recall_delay_sec 默认 3 */ 3) * 1000
    const stayMs = Number(/* popup_stay_sec 默认 8 */ 8) * 1000
    timers.current.push(window.setTimeout(() => setRevealed(true), recallMs))
    timers.current.push(window.setTimeout(() => window.tasymize.dismiss(), recallMs + stayMs))
    void playSound()
  }, [])

  useEffect(() => {
    // 方案A（主动 pull）：mount 后立即拉一次当前词，覆盖"启动即有到期词、
    // push 消息早于 did-finish-load 被丢弃"的场景；onShow 仅作"有词了"的信号，
    // 收到信号后同样主动拉取，不依赖推送 payload。
    void window.tasymize.getCurrent().then((e) => { if (e) start(e) })
    window.tasymize.onShow(() => {
      void window.tasymize.getCurrent().then((e) => { if (e) start(e) })
    })
    return () => timers.current.forEach(clearTimeout)
  }, [start])

  if (!expr) return null

  const send = (g: 0 | 1 | 2): void => {
    void window.tasymize.grade(expr.id, g)
    window.tasymize.dismiss()
  }

  return (
    <div className="m-0 flex h-full w-full items-center justify-center bg-transparent">
      <div className="w-full rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-md">
        <div className="text-sm text-slate-400">{expr.word}</div>
        {revealed ? (
          <>
            <div className="mt-1 text-xl font-semibold text-emerald-300">{expr.meaning}</div>
            <div className="mt-2 text-xs leading-relaxed text-slate-300">{expr.example}</div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => send(0)} className="flex-1 rounded-lg bg-rose-500/20 py-1.5 text-sm text-rose-300 hover:bg-rose-500/30">😵 忘了</button>
              <button onClick={() => send(1)} className="flex-1 rounded-lg bg-amber-500/20 py-1.5 text-sm text-amber-300 hover:bg-amber-500/30">🤔 有点印象</button>
              <button onClick={() => send(2)} className="flex-1 rounded-lg bg-emerald-500/20 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/30">😎 记得</button>
            </div>
          </>
        ) : (
          <div className="mt-1 text-xl font-semibold text-slate-500">… 回想一下高级表达 …</div>
        )}
      </div>
    </div>
  )
}
