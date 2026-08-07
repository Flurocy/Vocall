import type { ReactElement } from 'react'
// 品牌真 logo（lobe-icons @lobehub/icons-static-svg，开源可商用矢量库）。
// 原始 SVG 下载到 src/renderer/assets/brands/，构建期内联进来——离线可用、不依赖运行时联网。
// ?raw 由 vite 注入原文；渲染端只 strip <title> 标签（避免 hover 浮原生 tooltip）。
import deepseekSvg from '../assets/brands/deepseek.svg?raw'
import kimiSvg from '../assets/brands/kimi.svg?raw'
import zhipuSvg from '../assets/brands/zhipu.svg?raw'
import alibabacloudSvg from '../assets/brands/alibabacloud.svg?raw'
import geminiSvg from '../assets/brands/gemini.svg?raw'

// 品牌 key → 清洗后的 SVG 字符串
const RAW: Record<string, string> = {
  deepseek: deepseekSvg,
  kimi: kimiSvg,
  glm: zhipuSvg, // 智谱 GLM 用 zhipu 官方 logo
  aliyun: alibabacloudSvg,
  gemini: geminiSvg,
}
const BRAND_SVG: Record<string, string> = Object.fromEntries(
  Object.entries(RAW).map(([k, s]) => [k, s.replace(/<title>[^<]*<\/title>/g, '')]),
)

/** 按名称 + baseUrl 关键词识别品牌（用户手填/改名也能大概率命中） */
export function detectBrand(name: string, baseUrl: string): string {
  const s = `${name} ${baseUrl}`.toLowerCase()
  if (s.includes('deepseek')) return 'deepseek'
  if (s.includes('kimi') || s.includes('moonshot')) return 'kimi'
  if (s.includes('glm') || s.includes('bigmodel') || s.includes('智谱') || s.includes('zhipu') || s.includes('z.ai')) return 'glm'
  if (s.includes('aliyun') || s.includes('dashscope') || s.includes('百炼') || s.includes('qwen') || s.includes('alibaba')) return 'aliyun'
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
  const svg = BRAND_SVG[key]
  if (svg) {
    // 真品牌 logo：内联 SVG，span 控尺寸（svg 本身 width/height=1em → 跟随 fontSize）
    return (
      <span
        aria-hidden
        className="flex shrink-0 select-none items-center justify-center"
        style={{ width: size, height: size, fontSize: size }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }
  // custom 兜底：灰底首字符（无品牌可识别的自建供应商）
  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-md font-semibold"
      style={{ width: size, height: size, backgroundColor: '#64748b', color: '#fff', fontSize: Math.round(size * 0.55) }}
    >
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </span>
  )
}
