import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { THEMES, getTheme, getFontSize, FONT_SIZE_MIN, FONT_SIZE_MAX } from '../../theme'
import type { Theme } from '../../theme'

const NUMBER_FIELDS: { key: string; label: string; min: number }[] = [
  { key: 'popup_interval_min', label: '弹出间隔（分钟）', min: 1 },
  { key: 'popup_stay_sec', label: '停留时长（秒）', min: 1 },
  { key: 'pass_count', label: '过关所需连续答对次数', min: 1 },
  // 注：'每日弹出上限'(daily_cap) 是死设置——无任何消费方，已从界面移除（评审 I-2），实现留 backlog
]

interface Props {
  theme: Theme
  onSettingChanged: (key: string, value: string) => void
}

// 现代简洁风：每个分区一张卡片（白底半透 + 细边 + 圆角 + 轻投影），
// 分区标题用 accentText 建立层级，留白加大。配色全部走 theme / 中性色。
export default function SettingsView({ theme, onSettingChanged }: Props): ReactElement {
  const [settings, setSettings] = useState<Record<string, string>>({})

  useEffect(() => {
    void window.tasymize.getSettings().then(setSettings)
  }, [])

  // 即时保存：写入主进程 + 刷新本地 state；主题/字号另通知 App 立即换肤
  const update = async (key: string, value: string): Promise<void> => {
    await window.tasymize.setSetting(key, value)
    setSettings((s) => ({ ...s, [key]: value }))
    onSettingChanged(key, value)
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
      <h2 className="mb-6 text-xl font-semibold">设置</h2>
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
      </div>
    </div>
  )
}
