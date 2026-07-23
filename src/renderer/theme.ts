// 主题系统：深色底（slate-950/900、white/* 边框）不变，只换强调色。
// ⚠️ Tailwind v4 JIT 约束：所有类名必须是完整字符串字面量，
// 禁止运行时拼接（如 `text-${id}-300`），否则 JIT 扫不到、样式不生效。
// 管理窗口与弹窗两端共用同一份定义（决策①：两端联动整套换）。

export interface Theme {
  id: string
  label: string        // 设置界面显示名
  accentText: string   // 强调文字色（标题、meaning、角标）
  accentBg: string     // 选中/激活背景（导航激活态、分段按钮选中、评分"记得"）
  accentBgHover: string // 上述激活态的 hover（含 hover: 前缀的完整字面量）
  swatch: string       // 设置界面色板小圆点
  accentColor: string  // 原生控件 accent-color（checkbox/range）
}

export const THEMES: Theme[] = [
  {
    id: 'emerald', label: '翠绿',
    accentText: 'text-emerald-300',
    accentBg: 'bg-emerald-500/20',
    accentBgHover: 'hover:bg-emerald-500/30',
    swatch: 'bg-emerald-400',
    accentColor: 'accent-emerald-500',
  },
  {
    id: 'sky', label: '天蓝',
    accentText: 'text-sky-300',
    accentBg: 'bg-sky-500/20',
    accentBgHover: 'hover:bg-sky-500/30',
    swatch: 'bg-sky-400',
    accentColor: 'accent-sky-500',
  },
  {
    id: 'violet', label: '紫罗兰',
    accentText: 'text-violet-300',
    accentBg: 'bg-violet-500/20',
    accentBgHover: 'hover:bg-violet-500/30',
    swatch: 'bg-violet-400',
    accentColor: 'accent-violet-500',
  },
  {
    id: 'amber', label: '琥珀',
    accentText: 'text-amber-300',
    accentBg: 'bg-amber-500/20',
    accentBgHover: 'hover:bg-amber-500/30',
    swatch: 'bg-amber-400',
    accentColor: 'accent-amber-500',
  },
  {
    id: 'rose', label: '玫瑰',
    accentText: 'text-rose-300',
    accentBg: 'bg-rose-500/20',
    accentBgHover: 'hover:bg-rose-500/30',
    swatch: 'bg-rose-400',
    accentColor: 'accent-rose-500',
  },
]

export const DEFAULT_THEME_ID = 'emerald'

// 找不到/空 id → 默认 emerald（THEMES[0]）
export function getTheme(id?: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

// 字号档：三档映射根字号，顶层容器 style={{ fontSize }} 让 em/rem 级联缩放。
// 只调字号，不做整窗 GUI 缩放（用户决策③）。
export const FONT_SIZE_OPTIONS: { id: string; label: string; px: string }[] = [
  { id: 'sm', label: '小', px: '14px' },
  { id: 'md', label: '中', px: '16px' },
  { id: 'lg', label: '大', px: '18px' },
]

export function getFontSize(id?: string | null): string {
  return FONT_SIZE_OPTIONS.find((o) => o.id === id)?.px ?? '16px'
}
