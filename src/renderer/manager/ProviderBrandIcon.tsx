import type { ReactElement } from 'react'

// 品牌徽标：参考 CC Switch 在供应商名称旁显示品牌图标。
// 真 logo 是各家商标资产，凭空画易走样反而不精致；改用「品牌色首字母徽标」——
// 干净、统一、贴现代简洁审美。按品牌 key 映射字母 + 品牌色。
// 识别逻辑：优先按名称/URL 关键词匹配（用户手填的也能识别），匹配不到回落灰色首字母。

interface BrandSpec {
  letter: string
  // 用 inline style 的完整色值（Tailwind JIT 不认动态拼接的类名）
  bg: string
  fg: string
}

const BRANDS: Record<string, BrandSpec> = {
  deepseek: { letter: 'D', bg: '#4d6bfe', fg: '#ffffff' },   // DeepSeek 蓝
  kimi:     { letter: 'K', bg: '#0f0f0f', fg: '#ffffff' },   // Kimi 黑
  glm:      { letter: 'G', bg: '#3b5bfd', fg: '#ffffff' },   // 智谱蓝
  aliyun:   { letter: '阿', bg: '#ff6a00', fg: '#ffffff' },   // 阿里橙
  gemini:   { letter: 'G', bg: '#1a73e8', fg: '#ffffff' },   // Gemini 蓝
  custom:   { letter: '?', bg: '#64748b', fg: '#ffffff' },   // slate 灰兜底
}

/** 按名称 + baseUrl 关键词识别品牌（用户手填/改名也能大概率命中） */
export function detectBrand(name: string, baseUrl: string): string {
  const s = `${name} ${baseUrl}`.toLowerCase()
  if (s.includes('deepseek')) return 'deepseek'
  if (s.includes('kimi') || s.includes('moonshot')) return 'kimi'
  if (s.includes('glm') || s.includes('bigmodel') || s.includes('智谱') || s.includes('z.ai')) return 'glm'
  if (s.includes('aliyun') || s.includes('dashscope') || s.includes('百炼') || s.includes('qwen')) return 'aliyun'
  if (s.includes('gemini') || s.includes('googleapis') || s.includes('google')) return 'gemini'
  return 'custom'
}

export default function ProviderBrandIcon({
  name,
  baseUrl,
  size = 20,
}: {
  name: string
  baseUrl: string
  size?: number
}): ReactElement {
  const key = detectBrand(name, baseUrl)
  const spec = BRANDS[key] ?? BRANDS.custom
  // custom 兜底用名称首字符（大写），比 '?' 更贴
  const letter = key === 'custom' ? (name.trim()[0]?.toUpperCase() ?? '?') : spec.letter
  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-md font-semibold"
      style={{
        width: size,
        height: size,
        backgroundColor: spec.bg,
        color: spec.fg,
        fontSize: Math.round(size * 0.55),
      }}
    >
      {letter}
    </span>
  )
}
