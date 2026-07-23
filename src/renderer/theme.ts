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
