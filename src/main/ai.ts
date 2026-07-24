// DeepSeek API 调用（兼容 OpenAI chat.completions 格式）。
// 文档：https://api-docs.deepseek.com/  —— POST {baseUrl}/chat/completions，Bearer 认证。
// 安全：API key 只在主进程使用，绝不进渲染进程；渲染端通过 IPC 触发调用。
// 模型默认 deepseek-v4-flash（快+便宜，适合生成词组/例句）；deepseek-chat 已于 2026-07 弃用。

export interface AiCallOptions {
  system?: string
  user: string
  /** 输出 token 上限，默认 1024。推理模型(pro)会先耗 token 在思考上，别给太小 */
  maxTokens?: number
  /** 采样温度，默认 0.7（生成类任务略高） */
  temperature?: number
  /** 超时毫秒，默认 60s。推理模型思考慢，给足；超时抛错避免 UI 永远"测试中" */
  timeoutMs?: number
}

export interface AiConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export const DEFAULT_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_MODEL = 'deepseek-v4-flash'

// OpenAI 兼容响应的最小结构（推理模型除 content 外还有 reasoning_content 思考过程）
interface ChatCompletionResponse {
  choices?: { message?: { content?: string; reasoning_content?: string } }[]
  error?: { message?: string }
}

/**
 * 调用 DeepSeek chat completion，返回文本内容。
 * 失败（网络/HTTP/格式/key 无效/超时）一律 throw Error，由调用方捕获并转成用户可读信息。
 */
export async function callDeepseek(cfg: AiConfig, opts: AiCallOptions): Promise<string> {
  if (!cfg.apiKey) throw new Error('未配置 API key')

  const messages: { role: string; content: string }[] = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  messages.push({ role: 'user', content: opts.user })

  // 超时控制：pro 推理模型思考可能很久，必须设上限，否则请求挂起 UI 永远等待
  const timeoutMs = opts.timeoutMs ?? 60_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
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
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`请求超时（>${Math.round(timeoutMs / 1000)}s）——推理模型(pro)思考较慢，可改用 flash 或稍后重试`)
    }
    throw new Error(`网络请求失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // 401=认证失败(key 错), 402=余额不足, 429=限流, 5xx=服务端 —— 给用户可定位的信息
    throw new Error(`DeepSeek 请求失败 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
  }

  const data = (await res.json()) as ChatCompletionResponse
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    // 推理模型可能 max_tokens 全耗在 reasoning_content 上导致 content 为空——给出可定位提示
    const hasReasoning = Boolean(data.choices?.[0]?.message?.reasoning_content)
    throw new Error(
      hasReasoning
        ? '模型思考占用全部 token，正文为空——请增大 max_tokens 或改用 flash 模型'
        : `DeepSeek 返回格式异常：${data.error?.message ?? 'content 为空'}`,
    )
  }
  return content
}
