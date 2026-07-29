import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  THEMES,
  getTheme,
  getFontSize,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  getPopupScale,
  POPUP_SCALE_MIN,
  POPUP_SCALE_MAX,
  getPopupFontScale,
  POPUP_FONT_SCALE_MIN,
  POPUP_FONT_SCALE_MAX,
  getPopupOpacity,
  POPUP_OPACITY_MIN,
  POPUP_OPACITY_MAX,
} from '../../theme'
import type { Theme } from '../../theme'

const NUMBER_FIELDS: { key: string; label: string; min: number }[] = [
  { key: 'popup_interval_sec', label: '弹出间隔（秒）', min: 1 },
  { key: 'popup_stay_sec', label: '停留时长（秒）', min: 1 },
  // 注：'每日弹出上限'(daily_cap) 是死设置——无任何消费方，已从界面移除（评审 I-2），实现留 backlog
]

// 记忆节奏弹性数值（详见 specs/2026-07-23-wordbook-learning-queue-design.md 第五节）：
// 与主进程 ELASTIC_KEYS 一一对应，"恢复默认设置"按钮只重置这些键。
// pass_count 原在"弹窗与记忆"区，移入本区——它是弹性键，挪过来跟重置范围对齐、避免同一键两个输入框。
const ELASTIC_NUMBER_FIELDS: { key: string; label: string; hint: string; min: number }[] = [
  { key: 'learning_cap', label: '学习队列容量', hint: '同时在学的词数上限，学会一个才补一个新的', min: 1 },
  { key: 'pass_count', label: '过关所需连续答对次数', hint: '连续"认识"这么多次，这个词才算学会', min: 1 },
  { key: 'forgot_gap_pops', label: '「忘了」后过几次再见（弹窗次数）', hint: '点"忘了"的词，隔这么多次弹窗后再次出现', min: 1 },
  { key: 'fuzzy_gap_pops', label: '「模糊」后过几次再见（弹窗次数）', hint: '点"模糊"的词，隔这么多次弹窗后再次出现', min: 1 },
]
const ELASTIC_LIST_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'learning_step_pops', label: '学习递进间隔（弹窗次数，逗号分隔）', hint: '学习中每答对一次"认识"，下次出现的间隔按此序列往后推' },
  { key: 'review_steps_pops', label: '复习间隔阶梯（弹窗次数，逗号分隔）', hint: '学会后进入复习，每答对一次间隔爬一级' },
]

// 快捷键 accelerator 可读化展示：CommandOrControl → Ctrl、num1 → 小键盘1，其余原样；空串=未设置/禁用。
function formatHotkey(acc: string): string {
  if (!acc) return '未设置（已禁用）'
  return acc
    .replace('CommandOrControl', 'Ctrl')
    .replace(/\bnum(\d)\b/g, '小键盘$1')
}

// 按键 → Electron accelerator 主键名（用 event.code 区分大小键盘；event.key 不分 Numpad/Digit）。
// 返回 accelerator 键名（'A'/'1'/'num1'/'F5'/'Left'…），无法识别返回 null（调用方忽略该键继续监听）。
function codeToAccelerator(code: string): string | null {
  if (/^Digit([0-9])$/.test(code)) return code.slice(5) // Digit1 → '1'（主键盘）
  if (/^Numpad([0-9])$/.test(code)) return 'num' + code.slice(6) // Numpad1 → 'num1'（小键盘）
  if (/^Key([A-Z])$/.test(code)) return code.slice(3) // KeyA → 'A'
  if (/^F([1-9]|1[0-2])$/.test(code)) return code // F1-F12 原样
  if (code === 'ArrowLeft') return 'Left'
  if (code === 'ArrowRight') return 'Right'
  if (code === 'ArrowUp') return 'Up'
  if (code === 'ArrowDown') return 'Down'
  if (code === 'Home' || code === 'End' || code === 'PageUp' || code === 'PageDown') return code
  return null
}

// 单键（无修饰键）只允许「安全键」：小键盘数字、F1-F12。
// 这类键少用于打字，全局拦截影响小；字母/主键盘数字单键会被全局拦截导致打字触发，必须配修饰键。
function isSafeSingleKey(code: string): boolean {
  return /^Numpad[0-9]$/.test(code) || /^F([1-9]|1[0-2])$/.test(code)
}

interface Props {
  theme: Theme
  onSettingChanged: (key: string, value: string) => void
}

// 现代简洁风：每个分区一张卡片（白底半透 + 细边 + 圆角 + 轻投影），
// 分区标题用 accentText 建立层级，留白加大。配色全部走 theme / 中性色。
export default function SettingsView({ theme, onSettingChanged }: Props): ReactElement {
  const [settings, setSettings] = useState<Record<string, string>>({})
  // AI 测试连接结果：'success' | 'error' | 测试中文本
  const [aiTestMsg, setAiTestMsg] = useState<{ kind: 'ok' | 'err' | 'busy'; text: string } | null>(null)
  // 快捷键绑定监听态；hotkeyNotice 显示「已禁用快捷键」等一次性提示
  const [listening, setListening] = useState(false)
  const [hotkeyNotice, setHotkeyNotice] = useState<string | null>(null)
  // 版本号 + 检查更新结果（kind:'ok' 且有 url 时附"前往下载"跳 release 页）
  const [version, setVersion] = useState('')
  const [updateMsg, setUpdateMsg] = useState<{ kind: 'ok' | 'err' | 'busy'; text: string; url?: string | null } | null>(null)

  useEffect(() => {
    void window.vocall.getSettings().then(setSettings)
    void window.vocall.getVersion().then(setVersion)
  }, [])

  // 即时保存：写入主进程 + 刷新本地 state；主题/字号另通知 App 立即换肤
  const update = async (key: string, value: string): Promise<void> => {
    await window.vocall.setSetting(key, value)
    setSettings((s) => ({ ...s, [key]: value }))
    onSettingChanged(key, value)
  }

  // 持有最新 update 引用，供下方 listening effect 在不重挂监听的前提下调用
  const updateRef = useRef(update)
  updateRef.current = update

  // 游戏式按键绑定：listening=true 时挂一次 keydown（capture 阶段独占），组装 accelerator 保存并退出。
  // - Esc → 写空串（禁用）
  // - 有修饰键（Ctrl/Shift/Alt/Meta）+ 合法主键 → 绑定
  // - 无修饰键（单键）：仅小键盘数字 / F1-F12 允许（安全单键）；字母·主键盘数字忽略（需配修饰键）
  // 非法主键/不合规单键忽略继续监听；退出时卸载避免泄漏。用 event.code 区分大小键盘（event.key 不分）。
  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        void updateRef.current('popup_hotkey', '')
        setHotkeyNotice('已禁用快捷键')
        setListening(false)
        return
      }
      const mods: string[] = []
      if (e.ctrlKey) mods.push('CommandOrControl')
      if (e.shiftKey) mods.push('Shift')
      if (e.altKey) mods.push('Alt')
      if (e.metaKey) mods.push('Meta')
      const main = codeToAccelerator(e.code)
      if (!main) return // 无法识别的主键，忽略继续监听
      // 单键（无修饰键）只放行安全键（小键盘数字/F1-F12）；字母·主键盘数字单键会被全局拦截打字触发
      if (mods.length === 0 && !isSafeSingleKey(e.code)) return
      void updateRef.current('popup_hotkey', mods.length ? [...mods, main].join('+') : main)
      setHotkeyNotice(null)
      setListening(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listening])

  const testAi = async (): Promise<void> => {
    setAiTestMsg({ kind: 'busy', text: '测试中…' })
    const r = await window.vocall.testAi()
    setAiTestMsg(r.ok ? { kind: 'ok', text: r.message } : { kind: 'err', text: r.message })
  }

  // 检查更新（GitHub releases/latest）：有新版→附 releaseUrl 跳下载；失败/无更新/超时各有提示。
  const doCheckUpdate = async (): Promise<void> => {
    setUpdateMsg({ kind: 'busy', text: '检查中…' })
    const r = await window.vocall.checkUpdate()
    if (r.error) {
      setUpdateMsg({ kind: 'err', text: r.error, url: r.releaseUrl })
    } else if (r.hasUpdate) {
      setUpdateMsg({ kind: 'ok', text: `发现新版本 v${r.latest}`, url: r.releaseUrl })
    } else {
      setUpdateMsg({ kind: 'ok', text: '已是最新版本' })
    }
  }

  // 恢复默认：主进程重置弹性数值键后整体重拉，本地 state 一并刷新。
  // 只动记忆节奏数值，外观/音效/AI 不受影响，故无需 onSettingChanged
  const resetElastic = async (): Promise<void> => {
    if (!window.confirm('把"记忆节奏"相关数值恢复为默认值？外观、音效、AI 设置不受影响。')) return
    await window.vocall.resetElasticSettings()
    setSettings(await window.vocall.getSettings())
  }

  const currentTheme = getTheme(settings.theme)
  // font_size 现为连续 px（滑块），parseInt 兼容 '15'/'15px'；非法走 getFontSize 的默认
  const fontPx = parseInt(getFontSize(settings.font_size), 10)
  // 弹窗物理尺寸倍率 + 透明度：后端 getPopupScale/getPopupOpacity 已 parse+clamp，
  // 滑块显示值与主进程实际 resize/setOpacity 生效值一致（含非法/超范围兜底）。
  const scaleVal = parseFloat(getPopupScale(settings.popup_scale))
  // 弹窗内容 zoom 倍率（popup_font_scale）：只放大弹窗里的字和布局，不动窗口尺寸
  const popupFontVal = parseFloat(getPopupFontScale(settings.popup_font_scale))
  const opacityVal = parseFloat(getPopupOpacity(settings.popup_opacity))
  const soundOn = settings.sound_enabled !== 'false'
  const volume = Number(settings.sound_volume ?? '0.6')

  const card = 'rounded-2xl border border-black/10 bg-white/60 p-5 shadow-sm'
  const sectionTitle = `mb-3 text-sm font-medium ${theme.accentText}`
  const inputCls =
    'w-full rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none transition hover:bg-white focus:border-black/20 focus:bg-white'

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">设置</h2>
        <button
          onClick={() => void resetElastic()}
          className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-black/5"
        >
          恢复默认设置
        </button>
      </div>
      <div className="space-y-4">
        <section className={card}>
          <h3 className={sectionTitle}>主题色</h3>
          <div className="flex gap-3">
            {THEMES.map((t) => (
              <button
                key={t.id}
                title={t.label}
                aria-label={t.label}
                onClick={() => void update('theme', t.id)}
                className={`h-7 w-7 rounded-full ${t.swatch} transition ${
                  t.id === currentTheme.id
                    ? 'ring-2 ring-black/40 ring-offset-2 ring-offset-transparent'
                    : 'opacity-50 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        </section>

        <section className={card}>
          <h3 className={sectionTitle}>弹窗外观</h3>
          <div className="space-y-5">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">
                界面大小（{Math.round(scaleVal * 100)}%）
              </span>
              <input
                type="range"
                min={POPUP_SCALE_MIN}
                max={POPUP_SCALE_MAX}
                step={0.05}
                value={scaleVal}
                onChange={(e) => void update('popup_scale', e.target.value)}
                className={`w-full ${theme.accentColor}`}
              />
              <p className="mt-1.5 text-xs text-slate-500">调弹窗物理尺寸（宽高）</p>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">
                弹窗字体大小（{Math.round(popupFontVal * 100)}%）
              </span>
              <input
                type="range"
                min={POPUP_FONT_SCALE_MIN}
                max={POPUP_FONT_SCALE_MAX}
                step={0.05}
                value={popupFontVal}
                onChange={(e) => void update('popup_font_scale', e.target.value)}
                className={`w-full ${theme.accentColor}`}
              />
              <p className="mt-1.5 text-xs text-slate-500">只放大弹窗里的字和布局，不动窗口大小</p>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">
                管理界面字体大小（{fontPx}px）
              </span>
              <input
                type="range"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                value={fontPx}
                onChange={(e) => void update('font_size', e.target.value)}
                className={`w-full ${theme.accentColor}`}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                管理界面字号（rem 联动，只影响管理界面，不影响弹窗）
              </p>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">
                透明度（{Math.round(opacityVal * 100)}%）
              </span>
              <input
                type="range"
                min={POPUP_OPACITY_MIN}
                max={POPUP_OPACITY_MAX}
                step={0.05}
                value={opacityVal}
                onChange={(e) => void update('popup_opacity', e.target.value)}
                className={`w-full ${theme.accentColor}`}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                调弹窗透明度（0.5 半透明 ~ 1.0 不透明）
              </p>
            </label>
          </div>
        </section>

        <section className={card}>
          <h3 className={sectionTitle}>弹窗与记忆</h3>
          <div className="space-y-4">
            {NUMBER_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-sm text-slate-600">{f.label}</span>
                <input
                  type="number"
                  min={f.min}
                  value={settings[f.key] ?? ''}
                  onChange={(e) => void update(f.key, e.target.value)}
                  className={inputCls}
                />
              </label>
            ))}
          </div>
        </section>

        <section className={card}>
          <h3 className={sectionTitle}>快捷键</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-600">主动唤出弹窗</p>
                <p className="mt-1 text-xs text-slate-500">
                  任意窗口按此键唤出弹窗。支持组合键（Ctrl/Shift/Alt/Meta + 字母/数字/方向键）或安全单键（小键盘数字、F1-F12）；Esc 禁用
                </p>
              </div>
              <span
                className={`min-w-[8rem] rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-center font-mono text-sm ${
                  listening ? 'text-slate-400' : 'text-slate-700'
                }`}
              >
                {listening ? '等待按键…' : formatHotkey(settings.popup_hotkey ?? '')}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {hotkeyNotice && <span className="mr-auto text-sm text-slate-500">{hotkeyNotice}</span>}
              <button
                onClick={() => {
                  // 默认值字面量：与 src/main/settings.ts 的 DEFAULT_SETTINGS.popup_hotkey 保持一致。
                  // 不直接 import（主进程模块，会污染 renderer bundle）；改默认值时两处同改。
                  void update('popup_hotkey', 'CommandOrControl+Shift+W')
                  setListening(false)
                  setHotkeyNotice(null)
                }}
                className="rounded-lg border border-black/10 px-4 py-2 text-sm text-slate-600 transition hover:bg-black/5"
              >
                重置默认
              </button>
              <button
                onClick={() => {
                  setListening((v) => !v)
                  setHotkeyNotice(null)
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${theme.accentSolid} ${theme.accentSolidHover}`}
              >
                {listening ? '按下组合键…（Esc 禁用）' : '绑定'}
              </button>
            </div>
          </div>
        </section>

        <section className={card}>
          <h3 className={sectionTitle}>记忆节奏</h3>
          <div className="space-y-4">
            {ELASTIC_NUMBER_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-sm text-slate-600">{f.label}</span>
                <input
                  type="number"
                  min={f.min}
                  value={settings[f.key] ?? ''}
                  onChange={(e) => void update(f.key, e.target.value)}
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-slate-500">{f.hint}</p>
              </label>
            ))}
            {ELASTIC_LIST_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-sm text-slate-600">{f.label}</span>
                <input
                  type="text"
                  value={settings[f.key] ?? ''}
                  onChange={(e) => void update(f.key, e.target.value)}
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-slate-500">{f.hint}</p>
              </label>
            ))}
          </div>
        </section>

        <section className={card}>
          <h3 className={sectionTitle}>音效</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(e) => void update('sound_enabled', String(e.target.checked))}
                className={`h-4 w-4 ${theme.accentColor}`}
              />
              音效开关
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">
                音量（{Math.round(volume * 100)}%）
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={Number.isNaN(volume) ? 0.6 : volume}
                onChange={(e) => void update('sound_volume', e.target.value)}
                className={`w-full ${theme.accentColor}`}
              />
            </label>
          </div>
        </section>

        <section className={card}>
          <h3 className={sectionTitle}>发音</h3>
          <div className="flex gap-2">
            {([
              { id: 'british', label: '英音' },
              { id: 'american', label: '美音' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                onClick={() => void update('audio_accent', opt.id)}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm transition ${
                  (settings.audio_accent ?? 'british') === opt.id
                    ? `border-transparent font-medium ${theme.accentBg} ${theme.accentText}`
                    : 'border-black/10 text-slate-600 hover:bg-black/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            弹窗与生词库点击 🔊 朗读；雅思听力以英音为主
          </p>
        </section>

        <section className={card}>
          <h3 className={sectionTitle}>AI（DeepSeek）</h3>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">API Key</span>
              <input
                type="password"
                placeholder="sk-..."
                value={settings.ai_api_key ?? ''}
                onChange={(e) => void update('ai_api_key', e.target.value)}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-slate-500">
                仅保存在本机，不会上传。到 platform.deepseek.com 申请
              </p>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">模型</span>
              <input
                type="text"
                placeholder="deepseek-v4-flash"
                value={settings.ai_model ?? ''}
                onChange={(e) => void update('ai_model', e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Base URL（可选）</span>
              <input
                type="text"
                placeholder="https://api.deepseek.com"
                value={settings.ai_base_url ?? ''}
                onChange={(e) => void update('ai_base_url', e.target.value)}
                className={inputCls}
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void testAi()}
                disabled={aiTestMsg?.kind === 'busy'}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${theme.accentSolid} ${theme.accentSolidHover} disabled:opacity-50`}
              >
                测试连接
              </button>
              {aiTestMsg && (
                <span
                  className={`text-sm ${
                    aiTestMsg.kind === 'ok'
                      ? theme.accentText
                      : aiTestMsg.kind === 'err'
                        ? 'text-rose-600'
                        : 'text-slate-500'
                  }`}
                >
                  {aiTestMsg.text}
                </span>
              )}
            </div>
          </div>
        </section>

        <section className={card}>
          <h3 className={sectionTitle}>关于</h3>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">版本 {version || '…'}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => void doCheckUpdate()}
                disabled={updateMsg?.kind === 'busy'}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${theme.accentSolid} ${theme.accentSolidHover} disabled:opacity-50`}
              >
                检查更新
              </button>
              {updateMsg && (
                <span
                  className={`text-sm ${
                    updateMsg.kind === 'ok' ? theme.accentText : updateMsg.kind === 'err' ? 'text-rose-600' : 'text-slate-500'
                  }`}
                >
                  {updateMsg.text}
                  {updateMsg.url && (
                    <button
                      onClick={() => void window.vocall.openExternal(updateMsg.url!)}
                      className="ml-2 underline"
                    >
                      前往下载
                    </button>
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              数据保存在本机 AppData\Vocall，更新覆盖不会丢失。
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
