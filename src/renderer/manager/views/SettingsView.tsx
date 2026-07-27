import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { THEMES, getTheme, getFontSize, FONT_SIZE_MIN, FONT_SIZE_MAX } from '../../theme'
import type { Theme } from '../../theme'

const NUMBER_FIELDS: { key: string; label: string; min: number }[] = [
  { key: 'popup_interval_min', label: '弹出间隔（分钟）', min: 1 },
  { key: 'popup_stay_sec', label: '停留时长（秒）', min: 1 },
  // 注：'每日弹出上限'(daily_cap) 是死设置——无任何消费方，已从界面移除（评审 I-2），实现留 backlog
]

// 记忆节奏弹性数值（详见 specs/2026-07-23-wordbook-learning-queue-design.md 第五节）：
// 与主进程 ELASTIC_KEYS 一一对应，"恢复默认设置"按钮只重置这些键。
// pass_count 原在"弹窗与记忆"区，移入本区——它是弹性键，挪过来跟重置范围对齐、避免同一键两个输入框。
const ELASTIC_NUMBER_FIELDS: { key: string; label: string; hint: string; min: number }[] = [
  { key: 'learning_cap', label: '学习队列容量', hint: '同时在学的词数上限，学会一个才补一个新的', min: 1 },
  { key: 'pass_count', label: '过关所需连续答对次数', hint: '连续"认识"这么多次，这个词才算学会', min: 1 },
  { key: 'forgot_gap_min', label: '"忘了"后多久再见（分钟）', hint: '点"忘了"的词，隔这么久再次出现', min: 1 },
  { key: 'fuzzy_gap_min', label: '"模糊"后多久再见（分钟）', hint: '点"模糊"的词，隔这么久再次出现', min: 1 },
]
const ELASTIC_LIST_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'learning_step_min', label: '学习递进间隔（分钟，逗号分隔）', hint: '学习中每答对一次，下次间隔按这个序列往后推' },
  { key: 'review_steps_day', label: '复习间隔阶梯（天，逗号分隔）', hint: '学会后进入复习，每答对一次间隔爬一级' },
]

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

  useEffect(() => {
    void window.tasymize.getSettings().then(setSettings)
  }, [])

  // 即时保存：写入主进程 + 刷新本地 state；主题/字号另通知 App 立即换肤
  const update = async (key: string, value: string): Promise<void> => {
    await window.tasymize.setSetting(key, value)
    setSettings((s) => ({ ...s, [key]: value }))
    onSettingChanged(key, value)
  }

  const testAi = async (): Promise<void> => {
    setAiTestMsg({ kind: 'busy', text: '测试中…' })
    const r = await window.tasymize.testAi()
    setAiTestMsg(r.ok ? { kind: 'ok', text: r.message } : { kind: 'err', text: r.message })
  }

  // 恢复默认：主进程重置弹性数值键后整体重拉，本地 state 一并刷新。
  // 只动记忆节奏数值，外观/音效/AI 不受影响，故无需 onSettingChanged
  const resetElastic = async (): Promise<void> => {
    if (!window.confirm('把"记忆节奏"相关数值恢复为默认值？外观、音效、AI 设置不受影响。')) return
    await window.tasymize.resetElasticSettings()
    setSettings(await window.tasymize.getSettings())
  }

  const currentTheme = getTheme(settings.theme)
  // font_size 现为连续 px（滑块），parseInt 兼容 '15'/'15px'；非法走 getFontSize 的默认
  const fontPx = parseInt(getFontSize(settings.font_size), 10)
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
          <h3 className={sectionTitle}>界面缩放 / 字体大小（{fontPx}px）</h3>
          <input
            type="range"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={1}
            value={fontPx}
            onChange={(e) => void update('font_size', e.target.value)}
            className={`w-full ${theme.accentColor}`}
          />
          <p className="mt-2 text-xs text-slate-500">
            拖动整体缩放界面（字号与布局一起变大变小），左小右大
          </p>
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
      </div>
    </div>
  )
}
