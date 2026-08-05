// 主题系统：用户要的是换【背景色】（管理窗口底 + 弹窗卡片底随主题变），
// 强调色 accent 退居辅助。每个主题 = 一套柔彩色浅色背景基调 + 协调的强调色。
// 亮色系（2026-07-23 用户决策）：浅彩底 + 深文字（slate-800/600/500）+
// 深色细边框（black/10）。
// ⚠️ Tailwind v4 JIT 约束：所有类名必须是完整字符串字面量，
// 禁止运行时拼接（如 `bg-${id}-950`），否则 JIT 扫不到、样式不生效。
// 管理窗口与弹窗两端共用同一份定义（两端联动整套换）。

export interface Theme {
  id: string
  label: string        // 设置界面显示名
  bgApp: string        // 管理窗口主背景
  bgCard: string       // 弹窗卡片底（半透明+blur，需比 bgApp 略亮以浮起）
  accentText: string   // 强调文字色（标题、meaning、角标）
  accentBg: string     // 选中/激活背景（导航激活态、分段按钮选中）
  accentBgHover: string // 上述激活态的 hover（含 hover: 前缀的完整字面量）
  accentSolid: string  // 实色填充强调（评分"记得"按钮——与半透明语义色区分，防撞色）
  accentSolidHover: string // accentSolid 的 hover（含 hover: 前缀的完整字面量）
  swatch: string       // 设置界面色板小圆点（显示该主题背景基调）
  accentColor: string  // 原生控件 accent-color（checkbox/range）
  glow: string         // 氛围光颜色（rgba 主题色，JS 值非 Tailwind 类——用于 inline radial-gradient）
}

export const THEMES: Theme[] = [
  {
    id: 'emerald', label: '薄荷',
    bgApp: 'bg-emerald-50',
    bgCard: 'bg-emerald-100/95',
    accentText: 'text-emerald-700',
    accentBg: 'bg-emerald-500/15',
    accentBgHover: 'hover:bg-emerald-500/25',
    accentSolid: 'bg-emerald-600 text-white',
    accentSolidHover: 'hover:bg-emerald-500',
    swatch: 'bg-emerald-200',
    accentColor: 'accent-emerald-600',
    glow: 'rgba(16, 185, 129, 0.14)',
  },
  {
    id: 'sky', label: '天青',
    bgApp: 'bg-sky-50',
    bgCard: 'bg-sky-100/95',
    accentText: 'text-sky-700',
    accentBg: 'bg-sky-500/15',
    accentBgHover: 'hover:bg-sky-500/25',
    accentSolid: 'bg-sky-600 text-white',
    accentSolidHover: 'hover:bg-sky-500',
    swatch: 'bg-sky-200',
    accentColor: 'accent-sky-600',
    glow: 'rgba(14, 165, 233, 0.14)',
  },
  {
    id: 'violet', label: '薰衣草',
    bgApp: 'bg-violet-50',
    bgCard: 'bg-violet-100/95',
    accentText: 'text-violet-700',
    accentBg: 'bg-violet-500/15',
    accentBgHover: 'hover:bg-violet-500/25',
    accentSolid: 'bg-violet-600 text-white',
    accentSolidHover: 'hover:bg-violet-500',
    swatch: 'bg-violet-200',
    accentColor: 'accent-violet-600',
    glow: 'rgba(139, 92, 246, 0.14)',
  },
  {
    id: 'amber', label: '蜜杏',
    bgApp: 'bg-amber-50',
    bgCard: 'bg-amber-100/95',
    accentText: 'text-amber-700',
    accentBg: 'bg-amber-500/15',
    accentBgHover: 'hover:bg-amber-500/25',
    accentSolid: 'bg-amber-600 text-white',
    accentSolidHover: 'hover:bg-amber-500',
    swatch: 'bg-amber-200',
    accentColor: 'accent-amber-600',
    glow: 'rgba(245, 158, 11, 0.14)',
  },
  {
    id: 'rose', label: '樱粉',
    bgApp: 'bg-rose-50',
    bgCard: 'bg-rose-100/95',
    accentText: 'text-rose-700',
    accentBg: 'bg-rose-500/15',
    accentBgHover: 'hover:bg-rose-500/25',
    accentSolid: 'bg-rose-600 text-white',
    accentSolidHover: 'hover:bg-rose-500',
    swatch: 'bg-rose-200',
    accentColor: 'accent-rose-600',
    glow: 'rgba(244, 63, 94, 0.12)',
  },
]

export const DEFAULT_THEME_ID = 'emerald'

// 找不到/空 id → 默认 emerald（THEMES[0]）
export function getTheme(id?: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

// 字号/整体缩放：Tailwind 字号是 rem（相对根元素），改根 fontSize 即整窗缩放。
// font_size 存连续 px 值（字符串），UI 用滑块无级调（用户决策：滑块无级缩放）。
// 兼容旧三档 id（sm/md/lg）→ 映射 px。clamp 12–22px 防调崩。
export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 22
export const FONT_SIZE_DEFAULT = 16

// 兼容旧三档预设（老配置里可能存着 'sm'/'md'/'lg'）
export const FONT_SIZE_OPTIONS: { id: string; label: string; px: string }[] = [
  { id: 'sm', label: '小', px: '14px' },
  { id: 'md', label: '中', px: '16px' },
  { id: 'lg', label: '大', px: '18px' },
]

// 解析 font_size 设置为 px 字符串：'15'/'15px'→'15px'，'md'→'16px'，非法→默认 16px
export function getFontSize(value?: string | null): string {
  if (!value) return `${FONT_SIZE_DEFAULT}px`
  const preset = FONT_SIZE_OPTIONS.find((o) => o.id === value)
  if (preset) return preset.px
  const n = parseFloat(value)
  if (Number.isNaN(n)) return `${FONT_SIZE_DEFAULT}px`
  const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)))
  return `${clamped}px`
}

// 弹窗界面大小倍率（与 popup.ts readScale 范围同步）。
// 与字体大小解耦：这里管弹窗物理尺寸（width×height × scale），font_size 管内容字号。
// 范围 0.5–1.5（0.5=180×120，1.5=540×360），默认 1.0=360×240。
export const POPUP_SCALE_MIN = 0.5
export const POPUP_SCALE_MAX = 1.5
export const POPUP_SCALE_DEFAULT = 1.0

// 解析 popup_scale 设置为字符串数字：'1.2'→'1.2'，空/非法→'1'，超范围 clamp 到 0.5–1.5。
// 保留精度（不像 getFontSize 取整/加 px）——只做 parse+clamp+String。
export function getPopupScale(value?: string | null): string {
  if (!value) return String(POPUP_SCALE_DEFAULT)
  const n = parseFloat(value)
  if (Number.isNaN(n)) return String(POPUP_SCALE_DEFAULT)
  const clamped = Math.min(POPUP_SCALE_MAX, Math.max(POPUP_SCALE_MIN, n))
  return String(clamped)
}

// 弹窗透明度（与 popup.ts readOpacity 范围同步）。
// Electron BrowserWindow.setOpacity 接收 0–1；这里限 0.5–1.0（再低字看不清），默认 1.0=不透明。
export const POPUP_OPACITY_MIN = 0.5
export const POPUP_OPACITY_MAX = 1.0
export const POPUP_OPACITY_DEFAULT = 1.0

// 解析 popup_opacity 设置为字符串数字：'0.75'→'0.75'，空/非法→'1'，超范围 clamp 到 0.5–1.0。
// 与 getPopupScale 同策略（parseFloat+Number.isNaN+clamp+String，不取整保留精度）。
export function getPopupOpacity(value?: string | null): string {
  if (!value) return String(POPUP_OPACITY_DEFAULT)
  const n = parseFloat(value)
  if (Number.isNaN(n)) return String(POPUP_OPACITY_DEFAULT)
  const clamped = Math.min(POPUP_OPACITY_MAX, Math.max(POPUP_OPACITY_MIN, n))
  return String(clamped)
}

// 弹窗内容 zoom 倍率（纯渲染端，作用于 PopupCard 根容器的 CSS zoom）。
// 与 popup_scale 解耦：popup_scale 管窗口物理尺寸，这里只放大弹窗内容、不动窗口。
// 范围 0.5–1.5（下限 0.5：用户要能缩到更小；上限避免字过大撑破小窗口），默认 1.0=不缩放。
export const POPUP_FONT_SCALE_MIN = 0.5
export const POPUP_FONT_SCALE_MAX = 1.5
export const POPUP_FONT_SCALE_DEFAULT = 1.0

// 解析 popup_font_scale 设置为字符串数字：'1.25'→'1.25'，空/非法→'1'，超范围 clamp 到 0.5–1.5。
// 与 getPopupScale/getPopupOpacity 同策略（parseFloat+Number.isNaN+clamp+String，不取整保留精度）。
export function getPopupFontScale(value?: string | null): string {
  if (!value) return String(POPUP_FONT_SCALE_DEFAULT)
  const n = parseFloat(value)
  if (Number.isNaN(n)) return String(POPUP_FONT_SCALE_DEFAULT)
  const clamped = Math.min(POPUP_FONT_SCALE_MAX, Math.max(POPUP_FONT_SCALE_MIN, n))
  return String(clamped)
}
