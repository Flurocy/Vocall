import { describe, it, expect } from 'vitest'
import { detectBrand } from '../src/renderer/manager/ProviderBrandIcon'

// 品牌徽标识别：按名称/URL 关键词匹配供应商品牌（用于卡片名称旁的彩色首字母徽标）

describe('detectBrand —— 品牌识别', () => {
  it('DeepSeek：按名称或 URL', () => {
    expect(detectBrand('DeepSeek', '')).toBe('deepseek')
    expect(detectBrand('我的', 'https://api.deepseek.com')).toBe('deepseek')
  })
  it('Kimi：名称 / moonshot / kimi.com 都识别为 kimi', () => {
    expect(detectBrand('Kimi', '')).toBe('kimi')
    expect(detectBrand('Kimi for Coding', 'https://api.kimi.com/coding/v1')).toBe('kimi')
    expect(detectBrand('x', 'https://api.moonshot.cn/v1')).toBe('kimi')
  })
  it('智谱 GLM：glm / bigmodel / 智谱 / z.ai', () => {
    expect(detectBrand('智谱 GLM', '')).toBe('glm')
    expect(detectBrand('x', 'https://open.bigmodel.cn/api/paas/v4')).toBe('glm')
    expect(detectBrand('x', 'https://api.z.ai/api/paas/v4')).toBe('glm')
  })
  it('阿里百炼：aliyun / dashscope / qwen / 百炼', () => {
    expect(detectBrand('阿里百炼', '')).toBe('aliyun')
    expect(detectBrand('x', 'https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe('aliyun')
  })
  it('Gemini：gemini / googleapis', () => {
    expect(detectBrand('Gemini', '')).toBe('gemini')
    expect(detectBrand('x', 'https://generativelanguage.googleapis.com')).toBe('gemini')
  })
  it('未知：回落 custom', () => {
    expect(detectBrand('某不知名服务', 'https://api.example.com')).toBe('custom')
  })
})
