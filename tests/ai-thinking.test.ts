import { describe, it, expect, vi, afterEach } from 'vitest'
import { callDeepseek, type AiConfig } from '../src/main/ai'

// 验证 disableThinking 的请求体行为：DeepSeek 关思考=thinking:{type:'disabled'}（官方参数），
// 默认（主题生成等保留思考的场景）不得携带 thinking 字段。

const CFG: AiConfig = { apiKey: 'test-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' }

function captureBody(): { body: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {}
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    captured = JSON.parse(init.body as string) as Record<string, unknown>
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
  }))
  return { body: () => captured }
}

describe('callDeepseek 思考模式开关', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('disableThinking:true → 请求体带 thinking:{type:disabled}', async () => {
    const c = captureBody()
    await callDeepseek(CFG, { user: 'hi', disableThinking: true })
    expect(c.body().thinking).toEqual({ type: 'disabled' })
  })

  it('默认（不传）→ 请求体不带 thinking 字段（保留思考）', async () => {
    const c = captureBody()
    await callDeepseek(CFG, { user: 'hi' })
    expect('thinking' in c.body()).toBe(false)
  })
})
