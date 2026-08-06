import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement, MouseEvent as ReactMouseEvent } from 'react'
import type { PopupPayload } from '../../shared/ipc-types'
import { getTheme, getPopupFontScale } from '../theme'
import type { Theme } from '../theme'
import { playWord } from '../playWord'
import { pickShownSenses } from './senses'
import { popupEnter } from '../anim'
import { X, Minus, Check } from '@phosphor-icons/react'

// 音效：读设置里的 sound_file（接入位，空则用默认 pop.mp3）。
// 相对路径基于弹窗页面 URL（/popup/popup.html），'../<file>' 指向渲染资源根目录，
// dev 与 build 下都解析到 electron-vite 的 publicDir —— 即把音频放到
// src/renderer/public/pop.mp3 即可生效。也支持绝对路径（如 C:\sounds\pop.mp3）。
// 遵循 sound_enabled / sound_volume 设置；任何失败（文件缺失、解码失败、
// 自动播放限制）都静默吞掉，不影响卡片。
async function playSound(): Promise<void> {
  try {
    const settings = await window.vocall.getSettings()
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

// 弹窗 rem 基准固定 16px（用户决策：彻底解耦）——与管理界面字号(font_size)无关，
// 弹窗字体大小只由「弹窗字体大小」滑块（popup_font_scale → zoom）决定。
const ROOT_FONT_PX = '16px'

export default function PopupCard(): ReactElement | null {
  const [payload, setPayload] = useState<PopupPayload | null>(null)
  const [face, setFace] = useState<'front' | 'back'>('front')
  const [exampleOpen, setExampleOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => getTheme())
  // 弹窗内容 zoom 倍率（popup_font_scale）：弹窗字体的唯一调节项，
  // rem 基准已固定 16px，不再读 font_size（与管理界面字号彻底解耦）
  const [fontScale, setFontScale] = useState<string>(() => getPopupFontScale())
  const timers = useRef<number[]>([])
  // 卸载标志：getSettings 异步 resolve 可能晚于卸载，此时不得再 setState / push 定时器
  // （否则该定时器永不被清理，可能在卸载后触发 dismiss）
  const alive = useRef(true)
  // mouseup 回调在闭包里需要读到最新 face（决定点击是否翻卡）
  const faceRef = useRef(face)
  faceRef.current = face
  // 进行中的拖拽手势的清理函数（移除 window 监听器），卸载时兜底调用
  const dragCleanup = useRef<(() => void) | null>(null)
  // 根容器 ref：GSAP 入场动画目标（换新词 key 重挂载 → 每次弹窗播一次回弹）
  const rootRef = useRef<HTMLDivElement | null>(null)

  const start = useCallback((p: PopupPayload): void => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPayload(p)
    setFace('front')
    setExampleOpen(false)
    // 自动隐藏已改由主端 showPopup 统管（popup_stay_sec 后 hide，下个 showPopup 取消上个 hide），
    // 渲染端不再设 dismiss 定时器——否则 interval≈stay 时，上个 stayMs 的 hide 会撞上本次 show，
    // 弹窗闪一下消失。每次弹窗重读主题/弹窗字体倍率——设置改完后下一次弹窗即时换肤。
    void window.vocall.getSettings().then((settings) => {
      if (!alive.current) return
      setTheme(getTheme(settings.theme))
      // 每次弹窗重读弹窗字体倍率（popup_font_scale），设置改完后下一次弹窗即时生效；
      // 预览拖动中则用 payload 带的临时值（设置未提交），实现"拖字体滑块即见字变"。
      setFontScale(
        p.fontScaleOverride != null ? String(p.fontScaleOverride) : getPopupFontScale(settings.popup_font_scale),
      )
    })
    if (!p.preview) void playSound() // 预览静音——拖滑块会反复重弹卡片，不能砰砰响
  }, [])

  useEffect(() => {
    // 弹窗 rem 基准固定 16px，mount 时设一次即可（依赖 []）：
    // 与管理界面字号(font_size)彻底解耦，弹窗字体大小由 zoom(fontScale) 统管。
    // 根容器不再 inline fontSize——em/rem 均相对 html 根的 16px（本文件无 em 用法，全 rem/px）。
    document.documentElement.style.fontSize = ROOT_FONT_PX
  }, [])

  // GSAP 入场：payload 就位（含预览拖动中 payload 更新）后，每次 item 切换播一次弹性回弹。
  // 预览拖动只是 payload 内容更新、item.id 不变 → 不重复播（不重挂载也不乱动）。
  useEffect(() => {
    if (payload) popupEnter(rootRef.current)
  }, [payload?.item.id, payload?.preview]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // 方案A（主动 pull）：mount 后立即拉一次当前词，覆盖"启动即有到期词、
    // push 消息早于 did-finish-load 被丢弃"的场景；onShow 仅作"有词了"的信号，
    // 收到信号后同样主动拉取，不依赖推送 payload。
    void window.vocall.getCurrent().then((p) => { if (p) start(p) })
    window.vocall.onShow(() => {
      void window.vocall.getCurrent().then((p) => { if (p) start(p) })
    })
    // 真词显示时拖"弹窗字体"滑块：主进程发来临时倍率（设置未提交），直接改 zoom 即拖即变
    window.vocall.onFontScale((v) => { if (alive.current) setFontScale(String(v)) })
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
    window.vocall.dragStart(startX, startY)
    const onMove = (ev: MouseEvent): void => {
      // 粘性拖拽兜底：快速甩动时 mouseup 可能投递给窗外其他窗口而丢失，
      // 此后每次划过都会触发 onMove。发现按键已松开（buttons===0）说明手势
      // 实际已结束，立即自我清理，避免窗口粘着光标跑。
      if (ev.buttons === 0) { cleanup(); return }
      if (!dragging &&
          Math.hypot(ev.screenX - startX, ev.screenY - startY) > DRAG_THRESHOLD_PX) {
        dragging = true
      }
      if (dragging) window.vocall.dragMove(ev.screenX, ev.screenY)
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

  // 一词多义：挑选背面要显示的义项（纯函数，独立可测）：
  // 用户勾选了义项（selectedSenses）且词带 senses → 按勾选显示（词性+释义列表）；
  // 否则回退默认义项 meaning（旧词/未勾选/单义词，展示与从前完全一致）。
  // 防御：下标越界（数据异常）的过滤掉；过滤后为空也回退 meaning。
  const shownSenses = pickShownSenses(item)

  const send = (g: 0 | 1 | 2): void => {
    void window.vocall.grade(item.id, g)
    window.vocall.dismiss()
  }

  // 标为已掌握：次要操作，独立于三档评分主流程。
  // 直接进 mastered 终态（不再出现在弹窗队列），需要时可在生词库「重新背」复活。
  const master = async (): Promise<void> => {
    await window.vocall.master(item.id)
    window.vocall.dismiss()
  }

  // 卡片内按钮必须拦住 mousedown，避免从按钮起手误触拖拽/翻卡
  const stopMouseDown = (e: ReactMouseEvent): void => e.stopPropagation()

  return (
    // rem 基准已在根 html 固定 16px（见上方 useEffect），此处不再 inline fontSize；
    // zoom 整体缩放弹窗内容（字+布局），不动窗口尺寸、不连 rem 胀间距——弹窗字体只由它决定。
    // zoom 是 Chromium 标准化的布局级缩放（Electron 40 支持），元素重排、不糊不位移。
    // 入场动画由 GSAP 驱动（见 useEffect + anim.ts popupEnter，弹性回弹），不再用 CSS keyframes。
    <div
      key={`${item.id}-${payload.preview ? 'p' : 'r'}`}
      ref={rootRef}
      className="m-0 flex h-full w-full items-center justify-center bg-transparent"
      style={{ zoom: fontScale }}
    >
      <div
        onMouseDown={onCardMouseDown}
        className={`relative flex h-full w-full select-none flex-col justify-center overflow-hidden rounded-2xl border border-black/15 ${theme.bgCard} p-5 shadow-2xl backdrop-blur-md`}
      >
        {/* 卡片顶部氛围光：同主题径向微渐变，卡片与主题背景的呼应（overflow-hidden 收圆角） */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{ background: `radial-gradient(80% 100% at 50% 0%, ${theme.glow}, transparent 75%)` }}
        />
        <div className={`absolute right-3 top-2 text-[10px] ${theme.accentText}`}>
          {payload.preview ? '外观预览' : `已连续答对 ${Math.min(repetitions, passCount)}/${passCount}`}
        </div>
        {face === 'front' ? (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-semibold text-slate-800">{item.word}</span>
              {/* 🔊 朗读：次要图标按钮，stopMouseDown 防误触翻卡/拖拽（同评分按钮模式） */}
              <button
                onMouseDown={stopMouseDown}
                onClick={() => void playWord(item.word)}
                title="朗读"
                aria-label={`朗读 ${item.word}`}
                className="text-slate-400 transition hover:text-slate-600"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  <path d="M16 9a3 3 0 0 1 0 6" />
                  <path d="M19 6a7 7 0 0 1 0 12" />
                </svg>
              </button>
            </div>
            <div className="mt-2 text-xs text-slate-500">点击卡片查看释义</div>
          </div>
        ) : (
          // 背面内容超高（例句展开 + 大根字号）时内部滚动，评分按钮/已掌握始终可见可点，不被居中裁切。
          // popup-scroll 自定义细滚动条：currentColor=主题 accentText，换肤自动跟随
          <div className={`popup-scroll max-h-full overflow-y-auto ${theme.accentText}`}>
            <div className="text-2xl font-semibold text-slate-800">{item.word}</div>
            {forgotCount > 0 && (
              <div className="text-xs text-rose-500/80">已忘 {forgotCount} 次</div>
            )}
            {shownSenses && shownSenses.length > 0 ? (
              // 勾选义项列表：词性小标签 + 释义；最多 3 条（勾选上限），超高由外层滚动兜底
              <div className="mt-1 space-y-1">
                {shownSenses.map((s, i) => (
                  <div key={i} className={`text-xl font-semibold ${theme.accentText}`}>
                    <span className="mr-1.5 text-sm font-normal text-slate-400">{s.pos}</span>
                    {s.meaning}
                  </div>
                ))}
              </div>
            ) : (
              <div className={`mt-1 text-2xl font-semibold ${theme.accentText}`}>{item.meaning}</div>
            )}
            <button
              onMouseDown={stopMouseDown}
              onClick={() => setExampleOpen((v) => !v)}
              className="mt-2 text-sm text-slate-500 hover:text-slate-800"
            >
              {exampleOpen ? '▾ 收起例句' : '▸ 查看例句'}
            </button>
            {exampleOpen && (
              <div className="popup-scroll mt-1 max-h-28 overflow-y-auto text-base leading-relaxed text-slate-600">
                {item.example}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onMouseDown={stopMouseDown} onClick={() => send(0)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-500/15 py-2 text-base text-rose-700 transition hover:bg-rose-500/25 active:scale-95">
                <X size={15} weight="bold" /> 忘了
              </button>
              <button onMouseDown={stopMouseDown} onClick={() => send(1)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-amber-500/15 py-2 text-base text-amber-700 transition hover:bg-amber-500/25 active:scale-95">
                <Minus size={15} weight="bold" /> 有点印象
              </button>
              <button onMouseDown={stopMouseDown} onClick={() => send(2)} className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-base font-semibold transition active:scale-95 ${theme.accentSolid} ${theme.accentSolidHover}`}>
                <Check size={15} weight="bold" /> 记得
              </button>
            </div>
            {/* 次要操作：标为已掌握。细边框小按钮，不抢评分主流程的 accentSolid。 */}
            <button
              onMouseDown={stopMouseDown}
              onClick={() => void master()}
              className="mt-2 w-full rounded-md border border-slate-300/70 py-1.5 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white/40 hover:text-slate-700 active:scale-[0.98]"
            >
              标为已掌握（不再弹出）
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
