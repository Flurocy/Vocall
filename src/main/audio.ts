// 有道 dictvoice 真人发音：构造 URL + fetch MP3 转 base64 data URL。
// 渲染端直接播有道 URL 会被 CSP（default-src 'self'）/跨域拦，故由主进程代理 fetch，
// 返回 data:audio/mpeg;base64,... 供渲染端 new Audio(dataURL).play()。
// 接口：GET https://dict.youdao.com/dictvoice?audio={word}&type={1|2}，type=1 英音 / type=2 美音，返回 MP3。

/**
 * 英/美音 → 有道 type 参数：british/默认 → 1，american → 2。
 * 非精确匹配 'american' 一律当英音（容错空串/乱值；默认英音贴近雅思 A 类听力）。
 */
export function accentToType(accent: string): 1 | 2 {
  return accent === 'american' ? 2 : 1
}

/**
 * 构造有道 dictvoice URL（纯函数，export 可测）。
 * word 经 encodeURIComponent 防特殊字符/空格破坏 URL query。
 */
export function buildPronunciationUrl(word: string, accent: string): string {
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${accentToType(accent)}`
}

/**
 * fetch 有道发音 MP3，转 base64 data URL 返回（渲染端 new Audio(dataURL).play()）。
 * 失败（网络/HTTP/超时）一律抛 Error，IPC handler 透传，渲染端 catch 静默（断网不打扰）。
 * 超时 10s（复用 ai.ts 的 AbortController 模式）。
 */
export async function fetchPronunciation(word: string, accent: string): Promise<string> {
  const timeoutMs = 10_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(buildPronunciationUrl(word, accent), { signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`发音请求超时（>${Math.round(timeoutMs / 1000)}s）`)
    }
    throw new Error(`发音网络请求失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    throw new Error(`发音请求失败 HTTP ${res.status}`)
  }

  // 有道返回 MP3 → audio/mpeg；arrayBuffer 转 base64 用 Node Buffer（主进程可用）。
  const arrayBuffer = await res.arrayBuffer()
  const b64 = Buffer.from(arrayBuffer).toString('base64')
  return `data:audio/mpeg;base64,${b64}`
}
