// DeepSeek API 调用（兼容 OpenAI chat.completions 格式）。
// 文档：https://api-docs.deepseek.com/  —— POST {baseUrl}/chat/completions，Bearer 认证。
// 安全：API key 只在主进程使用，绝不进渲染进程；渲染端通过 IPC 触发调用。
// 模型默认 deepseek-v4-flash（快+便宜，适合生成词组/例句）；deepseek-chat 已于 2026-07 弃用。

export interface AiCallOptions {
  system?: string
  user: string
  /** 输出 token 上限，默认 1024 */
  maxTokens?: number
  /** 采样温度，默认 0.7（生成类任务略高） */
  temperature?: number
}

export interface AiConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export const DEFAULT_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_MODEL = 'deepseek-v4-flash'

// OpenAI 兼容响应的最小结构（只取我们需要的字段）
interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

/**
 * 调用 DeepSeek chat completion，返回文本内容。
 * 失败（网络/HTTP/格式/key 无效）一律 throw Error，由调用方捕获并转成用户可读信息。
 */
export async function callDeepseek(cfg: AiConfig, opts: AiCallOptions): Promise<string> {
  if (!cfg.apiKey) throw new Error('未配置 API key')

  const messages: { role: string; content: string }[] = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  messages.push({ role: 'user', content: opts.user })

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      stream: false,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // 401=认证失败(key 错), 402=余额不足, 429=限流, 5xx=服务端 —— 给用户可定位的信息
    throw new Error(`DeepSeek 请求失败 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
  }

  const data = (await res.json()) as ChatCompletionResponse
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`DeepSeek 返回格式异常：${data.error?.message ?? 'content 为空'}`)
  }
  return content
}
