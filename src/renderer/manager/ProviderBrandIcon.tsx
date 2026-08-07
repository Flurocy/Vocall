import type { ReactElement } from 'react'
// 品牌真 logo（lobe-icons @lobehub/icons-static-svg，开源可商用矢量库）。
// 原始 SVG 下载到 src/renderer/assets/brands/，构建期 ?raw 内联——离线可用、不依赖运行时联网。
// 深色/白色 logo（Kimi 白 K）白底上看不见 → 套深色圆角底衬（参考 CC Switch 的深色衬底处理）。
import deepseekSvg from '../assets/brands/deepseek.svg?raw'
import kimiSvg from '../assets/brands/kimi.svg?raw'
import zhipuSvg from '../assets/brands/zhipu.svg?raw'
import alibabacloudSvg from '../assets/brands/alibabacloud.svg?raw'
import geminiSvg from '../assets/brands/gemini.svg?raw'

const strip = (s: string): string => s.replace(/<title>[^<]*<\/title>/g, '')

// 品牌 key → { svg, dark?: 是否需深色底衬 }
const BRAND_SVG: Record<string, { svg: string; dark?: boolean }> = {
  deepseek: { svg: strip(deepseekSvg) },
  kimi: { svg: strip(kimiSvg), dark: true }, // 白 K + 蓝点，白底隐形 → 深色衬底
  glm: { svg: strip(zhipuSvg) },
  aliyun: { svg: strip(alibabacloudSvg) },
  gemini: { svg: strip(geminiSvg) },
}

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
  brand,
  size = 20,
}: {
  name: string
  baseUrl: string
  /** 模板/已知品牌 key：传入则跳过关键词探测（Kimi for Coding 等靠它区分） */
  brand?: string
  size?: number
}): ReactElement {
  const key = brand && brand !== 'custom' ? brand : detectBrand(name, baseUrl)
  // kimi-for-coding 复用 kimi 的 logo
  const spec = BRAND_SVG[key === 'kimi-for-coding' ? 'kimi' : key]
  if (spec) {
    return (
      <span
        aria-hidden
        className="flex shrink-0 select-none items-center justify-center rounded-md"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * (spec.dark ? 0.72 : 1)),
          backgroundColor: spec.dark ? '#0f0f0f' : 'transparent',
        }}
        dangerouslySetInnerHTML={{ __html: spec.svg }}
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
