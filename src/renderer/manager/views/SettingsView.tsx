import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'

const FIELDS: { key: string; label: string }[] = [
  { key: 'popup_interval_min', label: '弹出间隔（分钟）' },
  { key: 'popup_stay_sec', label: '停留时长（秒）' },
  { key: 'recall_delay_sec', label: '回想时长（秒）' },
  { key: 'sound_enabled', label: '音效开关（true/false）' },
  { key: 'sound_volume', label: '音量（0-1）' },
  { key: 'daily_cap', label: '每日弹出上限' },
]

export default function SettingsView(): ReactElement {
  const [settings, setSettings] = useState<Record<string, string>>({})

  useEffect(() => {
    void window.tasymize.getSettings().then(setSettings)
  }, [])

  const update = async (key: string, value: string): Promise<void> => {
    await window.tasymize.setSetting(key, value)
    setSettings((s) => ({ ...s, [key]: value }))
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">设置</h2>
      <div className="max-w-md space-y-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-sm text-slate-400">{f.label}</span>
            <input
              value={settings[f.key] ?? ''}
              onChange={(e) => void update(f.key, e.target.value)}
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  )
}
