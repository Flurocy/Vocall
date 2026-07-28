import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement, MouseEvent as ReactMouseEvent } from 'react'
import type { PopupPayload } from '../../shared/ipc-types'
import { getTheme, getFontSize } from '../theme'
import type { Theme } from '../theme'

// 音效：读设置里的 sound_file（接入位，空则用默认 pop.mp3）。
// 相对路径基于弹窗页面 URL（/popup/popup.html），'../<file>' 指向渲染资源根目录，
// dev 与 build 下都解析到 electron-vite 的 publicDir —— 即把音频放到
// src/renderer/public/pop.mp3 即可生效。也支持绝对路径（如 C:\sounds\pop.mp3）。
// 遵循 sound_enabled / sound_volume 设置；任何失败（文件缺失、解码失败、
// 自动播放限制）都静默吞掉，不影响卡片。
async function playSound(): Promise<void> {
  try {
    const settings = await window.tasymize.getSettings()
    if (settings.sound_enabled === 'false') return
    const file = settings.sound_file || 'pop.mp3'
    const isAbsolute = /^([a-zA-Z]:[\\/]|\/|file:)/.test(file)
    const url = isAbsolute ? `file:///${file.replace(/\\/g, '/')}` : `../${file}`
    const audio = new Audio(url)
    const vol = Number(settings.sound_volume)
    audio.volume = Number.isNaN(vol) ? 0.6 : Math.min(1, Math.max(0, vol))
    await audio.play().catch(() => {})
  } catch {
    /* 音效失败静默 */
  }
}

// 点击/拖拽判定阈值：位移 ≤ 5px 算点击（正面则翻卡），> 5px 算拖动窗口
const DRAG_THRESHOLD_PX = 5

export default function PopupCard(): ReactElement | null {
  const [payload, setPayload] = useState<PopupPayload | null>(null)
  const [face, setFace] = useState<'front' | 'back'>('front')
  const [exampleOpen, setExampleOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => getTheme())
  const [fontSize, setFontSize] = useState<string>(() => getFontSize())
  const timers = useRef<number[]>([])
  // 卸载标志：getSettings 异步 resolve 可能晚于卸载，此时不得再 setState / push 定时器
  // （否则该定时器永不被清理，可能在卸载后触发 dismiss）
  const alive = useRef(true)
  // mouseup 回调在闭包里需要读到最新 face（决定点击是否翻卡）
  const faceRef = useRef(face)
  faceRef.current = face
  // 进行中的拖拽手势的清理函数（移除 window 监听器），卸载时兜底调用
  const dragCleanup = useRef<(() => void) | null>(null)

  const start = useCallback((p: PopupPayload): void => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPayload(p)
    setFace('front')
    setExampleOpen(false)
    // 自动隐藏已改由主端 showPopup 统管（popup_stay_sec 后 hide，下个 showPopup 取消上个 hide），
    // 渲染端不再设 dismiss 定时器——否则 interval≈stay 时，上个 stayMs 的 hide 会撞上本次 show，
    // 弹窗闪一下消失。每次弹窗重读主题/字号——设置改完后下一次弹窗即时换肤。
    void window.tasymize.getSettings().then((settings) => {
      if (!alive.current) return
      setTheme(getTheme(settings.theme))
      setFontSize(getFontSize(settings.font_size))
    })
    void playSound()
  }, [])

  useEffect(() => {
    // Tailwind 字号是 rem（相对根元素），顶层容器 style 之外需同步根元素字号
    document.documentElement.style.fontSize = fontSize
  }, [fontSize])

  useEffect(() => {
    // 方案A（主动 pull）：mount 后立即拉一次当前词，覆盖"启动即有到期词、
    // push 消息早于 did-finish-load 被丢弃"的场景；onShow 仅作"有词了"的信号，
    // 收到信号后同样主动拉取，不依赖推送 payload。
    void window.tasymize.getCurrent().then((p) => { if (p) start(p) })
    window.tasymize.onShow(() => {
      void window.tasymize.getCurrent().then((p) => { if (p) start(p) })
    })
    return () => {
      alive.current = false
      timers.current.forEach(clearTimeout)
      dragCleanup.current?.()
    }
  }, [start])

  // 整窗拖拽 + 智能区分点击：mousedown 记录起点并上报主进程；
  // mousemove 位移 > 5px 才进入拖动（转发 screen 坐标给主进程平移窗口）；
  // mouseup 位移 ≤ 5px 且处于正面 → 翻卡。监听器挂 window，拖出卡片也跟手。
  const onCardMouseDown = (e: ReactMouseEvent): void => {
    if (e.button !== 0) return
    const startX = e.screenX
    const startY = e.screenY
    let dragging = false
    window.tasymize.dragStart(startX, startY)
    const onMove = (ev: MouseEvent): void => {
      // 粘性拖拽兜底：快速甩动时 mouseup 可能投递给窗外其他窗口而丢失，
      // 此后每次划过都会触发 onMove。发现按键已松开（buttons===0）说明手势
      // 实际已结束，立即自我清理，避免窗口粘着光标跑。
      if (ev.buttons === 0) { cleanup(); return }
      if (!dragging &&
          Math.hypot(ev.screenX - startX, ev.screenY - startY) > DRAG_THRESHOLD_PX) {
        dragging = true
      }
      if (dragging) window.tasymize.dragMove(ev.screenX, ev.screenY)
    }
    const cleanup = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      dragCleanup.current = null
    }
    const onUp = (ev: MouseEvent): void => {
      cleanup()
      if (Math.hypot(ev.screenX - startX, ev.screenY - startY) <= DRAG_THRESHOLD_PX &&
          faceRef.current === 'front') {
        setFace('back')
      }
    }
    dragCleanup.current = cleanup
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!payload) return null
  const { item, repetitions, passCount, forgotCount } = payload

  const send = (g: 0 | 1 | 2): void => {
    void window.tasymize.grade(item.id, g)
    window.tasymize.dismiss()
  }

  // 标为已掌握：次要操作，独立于三档评分主流程。
  // 直接进 mastered 终态（不再出现在弹窗队列），需要时可在生词库「重新背」复活。
  const master = async (): Promise<void> => {
    await window.tasymize.master(item.id)
    window.tasymize.dismiss()
  }

  // 卡片内按钮必须拦住 mousedown，避免从按钮起手误触拖拽/翻卡
  const stopMouseDown = (e: ReactMouseEvent): void => e.stopPropagation()

  return (
    // 顶层 fontSize 让内部 em/rem 级联缩放；日后若做整窗 GUI 缩放，在此容器加 transform scale 即可
    <div className="m-0 flex h-full w-full items-center justify-center bg-transparent" style={{ fontSize }}>
      <div
        onMouseDown={onCardMouseDown}
        className={`relative flex h-full w-full select-none flex-col justify-center rounded-2xl border border-black/15 ${theme.bgCard} p-5 shadow-2xl backdrop-blur-md`}
      >
        <div className={`absolute right-3 top-2 text-[10px] ${theme.accentText}`}>
          已连续答对 {Math.min(repetitions, passCount)}/{passCount}
        </div>
        {face === 'front' ? (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-semibold text-slate-800">{item.word}</div>
            <div className="mt-2 text-xs text-slate-500">点击卡片查看释义</div>
          </div>
        ) : (
          // 背面内容超高（例句展开 + 大根字号）时内部滚动，评分按钮/已掌握始终可见可点，不被居中裁切
          <div className="max-h-full overflow-y-auto">
            <div className="text-base font-medium text-slate-500">{item.word}</div>
            {forgotCount > 0 && (
              <div className="text-xs text-rose-500/80">已忘 {forgotCount} 次</div>
            )}
            <div className={`mt-1 text-2xl font-semibold ${theme.accentText}`}>{item.meaning}</div>
            <button
              onMouseDown={stopMouseDown}
              onClick={() => setExampleOpen((v) => !v)}
              className="mt-2 text-sm text-slate-500 hover:text-slate-800"
            >
              {exampleOpen ? '▾ 收起例句' : '▸ 查看例句'}
            </button>
            {exampleOpen && (
              <div className="mt-1 max-h-28 overflow-y-auto text-sm leading-relaxed text-slate-600">
                {item.example}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onMouseDown={stopMouseDown} onClick={() => send(0)} className="flex-1 rounded-lg bg-rose-500/15 py-2 text-base text-rose-700 hover:bg-rose-500/25">😵 忘了</button>
              <button onMouseDown={stopMouseDown} onClick={() => send(1)} className="flex-1 rounded-lg bg-amber-500/15 py-2 text-base text-amber-700 hover:bg-amber-500/25">🤔 有点印象</button>
              <button onMouseDown={stopMouseDown} onClick={() => send(2)} className={`flex-1 rounded-lg py-2 text-base font-semibold ${theme.accentSolid} ${theme.accentSolidHover}`}>😎 记得</button>
            </div>
            {/* 次要操作：标为已掌握。细边框小按钮，不抢评分主流程的 accentSolid。 */}
            <button
              onMouseDown={stopMouseDown}
              onClick={() => void master()}
              className="mt-2 w-full rounded-md border border-slate-300/70 py-1.5 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white/40 hover:text-slate-700"
            >
              标为已掌握（不再弹出）
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
