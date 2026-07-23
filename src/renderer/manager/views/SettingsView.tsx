import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { THEMES, FONT_SIZE_OPTIONS, getTheme, getFontSize } from '../../theme'
import type { Theme } from '../../theme'

const NUMBER_FIELDS: { key: string; label: string; min: number }[] = [
  { key: 'popup_interval_min', label: '弹出间隔（分钟）', min: 1 },
  { key: 'popup_stay_sec', label: '停留时长（秒）', min: 1 },
  { key: 'pass_count', label: '过关所需连续答对次数', min: 1 },
  { key: 'daily_cap', label: '每日弹出上限', min: 1 },
]

interface Props {
  theme: Theme
  onSettingChanged: (key: string, value: string) => void
}

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
  const currentFont = FONT_SIZE_OPTIONS.find((o) => o.px === getFontSize(settings.font_size))?.id ?? 'md'
  const soundOn = settings.sound_enabled !== 'false'
  const volume = Number(settings.sound_volume ?? '0.6')

  const sectionTitle = 'mb-2 text-sm font-medium text-slate-400'

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">设置</h2>
      <div className="max-w-md space-y-6">
        <section>
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
                    ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-slate-950'
                    : 'opacity-50 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        </section>

        <section>
          <h3 className={sectionTitle}>字体大小</h3>
          <div className="inline-flex rounded-lg bg-white/5 p-1">
            {FONT_SIZE_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => void update('font_size', o.id)}
                className={`rounded-md px-4 py-1.5 text-sm transition ${
                  o.id === currentFont
                    ? `${theme.accentBg} ${theme.accentText}`
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          {NUMBER_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-sm text-slate-400">{f.label}</span>
              <input
                type="number"
                min={f.min}
                value={settings[f.key] ?? ''}
                onChange={(e) => void update(f.key, e.target.value)}
                className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none"
              />
            </label>
          ))}
        </section>

        <section className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => void update('sound_enabled', String(e.target.checked))}
              className={`h-4 w-4 ${theme.accentColor}`}
            />
            音效开关
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">
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
        </section>
      </div>
    </div>
  )
}
