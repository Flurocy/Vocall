import { settingsBox } from './store'
import { DEFAULT_BASE_URL, DEFAULT_MODEL, type AiConfig } from './ai'

export const DEFAULT_SETTINGS: Record<string, string> = {
  popup_interval_sec: '480', // 弹出间隔（秒）；旧 popup_interval_min(分钟)由 migratePopupInterval 迁移×60
  popup_stay_sec: '15',
  // 注：旧"回想时长"键已随包2 自动翻卡一并废弃，勿再加回
  pass_count: '3',
  // —— 记忆节奏弹性数值（弹窗节拍队列模型，单位=弹窗次数，详见 specs/2026-07-24-pop-count-queue-scheduler.md 第六节）——
  learning_cap: '10',              // 学习队列容量（同时在学的词数）
  forgot_gap_pops: '3',            // 点"忘了"后过几次弹窗再见
  fuzzy_gap_pops: '8',             // 点"模糊"后过几次弹窗再见
  learning_step_pops: '1,2',       // learning 内"认识"递进（弹窗次数，逗号分隔）
  review_steps_pops: '50,150,350,750,1500', // review 间隔阶梯（弹窗次数，逗号分隔）；倒数第二档=掌握档
  // 注：popup_position（弹窗位置）/daily_cap（每日上限）默认值已删——两功能从未实现且无消费方（死设置）。
  // 弹窗可拖拽定位（默认右下角），每日用量由用户自行开关程序控制。将来真做再加回。
  popup_scale: '1.0', // 弹窗界面大小倍率（1.0=360×240），范围 0.8–1.5；解析见 popup.ts readScale / theme.ts getPopupScale
  popup_opacity: '1.0', // 弹窗透明度（1.0=不透明），范围 0.5–1.0；解析见 popup.ts readOpacity / theme.ts getPopupOpacity
  popup_font_scale: '1.0', // 弹窗内容 zoom 倍率（1.0=原样），范围 0.7–1.4；解析见 theme.ts getPopupFontScale
  theme: 'emerald',    // 主题色 id，见 src/renderer/theme.ts 的 THEMES
  font_size: '16',     // 连续 px 值（滑块无级缩放），兼容旧档 id sm/md/lg 见 theme.getFontSize
  sound_enabled: 'true',
  sound_volume: '0.6',
  sound_file: '',
  ai_provider: 'deepseek',
  ai_api_key: '',
  ai_base_url: '',
  ai_model: '',
  popup_hotkey: 'CommandOrControl+Shift+W', // 主动唤出全局快捷键（accelerator 字符串）；空串=禁用
  audio_accent: 'british', // 发音口音：british(默认,雅思A类)/american；main/audio.ts accentToType 据此选 type
}

export function getSetting(key: string): string | null {
  return settingsBox.get()[key] ?? DEFAULT_SETTINGS[key] ?? null
}

export function setSetting(key: string, value: string): void {
  settingsBox.set({ ...settingsBox.get(), [key]: value })
}

// 记忆节奏弹性数值键：设置页"恢复默认设置"只重置这些，外观/音效/AI 等不动
export const ELASTIC_KEYS = [
  'learning_cap', 'pass_count', 'forgot_gap_pops',
  'fuzzy_gap_pops', 'learning_step_pops', 'review_steps_pops',
] as const

export function resetElasticSettings(): void {
  for (const k of ELASTIC_KEYS) setSetting(k, DEFAULT_SETTINGS[k])
}

export function getAllSettings(): Record<string, string> {
  return { ...DEFAULT_SETTINGS, ...settingsBox.get() }
}

// review_steps_pops 默认值升级：旧默认 '80,240,560,1200,2400' → 新默认 '50,150,350,750,1500'
// （50 起步适配个人自用节奏，等比缩放保持原曲线形状）。用户自定义值不动；幂等可重复跑。
export function migrateReviewSteps(): void {
  const OLD = '80,240,560,1200,2400'
  const cur = settingsBox.get().review_steps_pops
  if (cur === undefined || cur === OLD) {
    settingsBox.set({ ...settingsBox.get(), review_steps_pops: DEFAULT_SETTINGS.review_steps_pops })
  }
}

// 弹出间隔单位升级：旧 popup_interval_min(分钟) → popup_interval_sec(秒)。
// 旧值 ×60 写入新键（保留用户调过的间隔）；无旧键则落默认 480s。幂等：已有新键则不动。
export function migratePopupInterval(): void {
  const s = settingsBox.get()
  if (s.popup_interval_sec !== undefined) return
  if (s.popup_interval_min !== undefined) {
    const sec = Math.max(1, Number(s.popup_interval_min) || 8) * 60
    settingsBox.set({ ...s, popup_interval_sec: String(sec) })
  }
}

// 组装 AI 配置：从设置读 key/baseUrl/model，空则落默认值。
// apiKey 可能为空（用户还没配）——调用方据此提示"请先配置 API key"。
export function getAiConfig(): AiConfig {
  return {
    apiKey: getSetting('ai_api_key') ?? '',
    baseUrl: getSetting('ai_base_url') || DEFAULT_BASE_URL,
    model: getSetting('ai_model') || DEFAULT_MODEL,
  }
}
