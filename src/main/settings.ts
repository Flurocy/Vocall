import { settingsBox } from './store'
import { DEFAULT_BASE_URL, DEFAULT_MODEL, type AiConfig } from './ai'

export const DEFAULT_SETTINGS: Record<string, string> = {
  popup_interval_min: '8',
  popup_stay_sec: '15',
  // 注：旧"回想时长"键已随包2 自动翻卡一并废弃，勿再加回
  pass_count: '3',
  popup_position: 'bottom-right',
  theme: 'emerald',    // 主题色 id，见 src/renderer/theme.ts 的 THEMES
  font_size: '16',     // 连续 px 值（滑块无级缩放），兼容旧档 id sm/md/lg 见 theme.getFontSize
  sound_enabled: 'true',
  sound_volume: '0.6',
  sound_file: '',
  daily_cap: '60',
  ai_provider: 'deepseek',
  ai_api_key: '',
  ai_base_url: '',
  ai_model: '',
}

export function getSetting(key: string): string | null {
  return settingsBox.get()[key] ?? DEFAULT_SETTINGS[key] ?? null
}

export function setSetting(key: string, value: string): void {
  settingsBox.set({ ...settingsBox.get(), [key]: value })
}

export function getAllSettings(): Record<string, string> {
  return { ...DEFAULT_SETTINGS, ...settingsBox.get() }
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
