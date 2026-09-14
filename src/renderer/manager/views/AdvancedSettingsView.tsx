import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Theme } from '../../theme'
import ConfirmModal from './ConfirmModal'

// 高级设置子页（design/v1.6.x-设置分层.md）：收纳"记忆节奏"弹性调参数值。
// 弹性数值是给"愿意调参"的人准备的（详见 specs/2026-07-23 设计），普通用户不该碰，
// 故从设置主页收进本子页，与 ModelConfigView 同为整页替换的子页模式。
// 纯 UI 重组：设置键名、默认值、主进程逻辑零改动。

// 记忆节奏弹性数值（与主进程 ELASTIC_KEYS 一一对应，"恢复默认设置"只重置这些键）。
// 常量从 SettingsView 平移至此——这些键只在本子页出现。
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

interface Props {
  theme: Theme
  /** 设置键值（SettingsView 透传的同一份 state，改完回主页即时一致） */
  settings: Record<string, string>
  /** 单键即时保存（SettingsView 的 update 透传） */
  onUpdate: (key: string, value: string) => Promise<void>
  /** 恢复默认：主进程重置弹性键 + 父级重拉 settings（确认弹窗在本子页内） */
  onResetElastic: () => Promise<void>
  onBack: () => void
}

export default function AdvancedSettingsView({ theme, settings, onUpdate, onResetElastic, onBack }: Props): ReactElement {
  // 自绘确认弹窗（替代 window.confirm，主题跟随）
  const [confirm, setConfirm] = useState(false)

  // 样式串与 SettingsView 主页同款卡片语言（贴项目惯例：各视图各自定义）
  const card = 'rounded-2xl border border-black/10 bg-white/60 p-5 shadow-sm'
  const sectionTitle = `mb-3 text-sm font-medium ${theme.accentText}`
  const inputCls =
    'w-full rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none transition hover:bg-white focus:border-black/20 focus:bg-white'

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-black/5"
        >
          ← 返回
        </button>
        <h2 className="text-xl font-semibold">高级设置</h2>
      </div>
      <div className="space-y-4">
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
                  onChange={(e) => void onUpdate(f.key, e.target.value)}
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-slate-600">{f.hint}</p>
              </label>
            ))}
            {ELASTIC_LIST_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-sm text-slate-600">{f.label}</span>
                <input
                  type="text"
                  value={settings[f.key] ?? ''}
                  onChange={(e) => void onUpdate(f.key, e.target.value)}
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-slate-600">{f.hint}</p>
              </label>
            ))}
          </div>
        </section>

        <section className={card}>
          <h3 className={sectionTitle}>恢复默认设置</h3>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              只重置「记忆节奏」数值，外观、音效、AI 等其他设置不受影响
            </p>
            <button
              onClick={() => setConfirm(true)}
              className="shrink-0 rounded-lg border border-black/10 px-4 py-2 text-sm text-slate-600 transition hover:bg-black/5"
            >
              恢复默认设置
            </button>
          </div>
        </section>
      </div>

      {confirm && (
        <ConfirmModal
          theme={theme}
          message={'把"记忆节奏"相关数值恢复为默认值？外观、音效、AI 设置不受影响。'}
          danger={false}
          onOk={() => {
            setConfirm(false)
            void onResetElastic()
          }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  )
}
