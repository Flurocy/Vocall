// DeepSeek API 调用（兼容 OpenAI chat.completions 格式）。
// 文档：https://api-docs.deepseek.com/  —— POST {baseUrl}/chat/completions，Bearer 认证。
// 安全：API key 只在主进程使用，绝不进渲染进程；渲染端通过 IPC 触发调用。
// 模型默认 deepseek-v4-flash（快+便宜，适合生成词组/例句）；deepseek-chat 已于 2026-07 弃用。

import { getAiConfig } from './settings'
import type { Sense } from '../shared/ipc-types'

export interface AiCallOptions {
  system?: string
  user: string
  /** 输出 token 上限，默认 1024。推理模型(pro)会先耗 token 在思考上，别给太小 */
  maxTokens?: number
  /** 采样温度，默认 0.7（生成类任务略高） */
  temperature?: number
  /** 超时毫秒，默认 60s。推理模型思考慢，给足；超时抛错避免 UI 永远"测试中" */
  timeoutMs?: number
  /**
   * 关闭思考模式（省 token + 提速）：翻译这类简单任务用。写死按场景区分——
   * translateVocab / 测试连接传 true，generateThemeVocab 不传（主题生成保留思考保质量）。
   * 注意：DeepSeek 关思考的正确姿势是 thinking:{type:'disabled'}；
   * 不能用 reasoning_effort:'none'（非官方参数，会 400）。
   */
  disableThinking?: boolean
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
        // 关思考（翻译/测试连接等简单任务省 token）：DeepSeek 官方参数 thinking:{type:'disabled'}
        ...(opts.disableThinking ? { thinking: { type: 'disabled' } } : {}),
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

// ============================================================================
// 内容生产：主题词组生成 + 生词 AI 翻译
// 这些是 AI 链路上"做什么"的语义层，复用上面的 callDeepseek 做网络调用。
// 解析层（parseVocabArray / parseVocabObject）是纯函数，独立可测。
// ============================================================================

/** AI 主题生成返回的词项；与 VocabItem 的核心字段对齐（不含 id/status/srs 等运行时态） */
export interface VocabEntry {
  word: string
  meaning: string
  example: string
  senses?: Sense[] // 一词多义：全部义项（按常用度排序）；meaning 仍=默认义项，向后兼容
}

/** AI 翻译返回的释义+例句 */
export interface Translation {
  meaning: string
  example: string
  senses?: Sense[] // 一词多义（同上）
}

/** 非空字符串校验：trim 后非空（拒绝 '   ' 这种纯空白）；类型守卫 */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * 宽容提取可选 senses 字段（一词多义增量）：
 * 缺失 → undefined（单义词/旧格式，正常）；存在且合法（[{pos,meaning} 非空]）→ 截到 4 个返回；
 * 存在但坏（类型错/全空）→ undefined 静默降级——义项是增量福利，不因它推翻整个翻译结果。
 */
function parseSensesField(v: unknown): Sense[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: Sense[] = []
  for (const s of v) {
    if (!s || typeof s !== 'object') continue
    const { pos, meaning } = s as { pos?: unknown; meaning?: unknown }
    if (isNonEmptyString(pos) && isNonEmptyString(meaning)) {
      out.push({ pos: pos.trim(), meaning: meaning.trim() })
    }
  }
  return out.length > 0 ? out.slice(0, 4) : undefined
}

/**
 * 从 AI 输出中抽取 JSON 片段：strip ```json fences 与前后杂音文字。
 * 思路：先 strip code block，若 body 整体以"另一种括号"包裹则判定类型不符（避免
 *   [{...}] 里第一个对象被 parseVocabObject 误取，或 {...} 传给 parseVocabArray）；否则
 *   定位第一个 open（`[` 或 `{`）与最后一个 close（`]` 或 `}`）切出来。
 * 模型即便遵守 prompt 偶尔仍会输出 "好的，结果是：[...] 以上。" 之类包裹，需容错。
 */
function extractJsonBlock(text: string, open: '[' | '{', close: ']' | '}'): string {
  let body = text.trim()
  // strip ```json / ``` 围栏
  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) body = fence[1].trim()

  // body 整体被"另一种括号"包裹 → 类型与期望不符（数组 vs 对象搞反）
  const oppositeOpen: Record<'[' | '{', '[' | '{'> = { '[': '{', '{': '[' }
  const oppositeClose: Record<']' | '}', ']' | '}'> = { ']': '}', '}': ']' }
  if (body.startsWith(oppositeOpen[open]) && body.endsWith(oppositeClose[close])) {
    throw new Error(`AI 返回的 JSON 类型与期望不符（期望 ${open}${close}）`)
  }

  // body 整体就是预期 JSON：直接用
  if (body.startsWith(open) && body.endsWith(close)) return body

  // fallback：前后有杂音文字（"好的：[...] 以上"），定位首尾符号切出
  const start = body.indexOf(open)
  const end = body.lastIndexOf(close)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`AI 返回中未找到 JSON（缺少 ${open}${close}）`)
  }
  return body.slice(start, end + 1)
}

/**
 * 解析 AI 返回的主题词组数组（容错版）。
 * 接受：纯 JSON / 裹 ```json fences / 前后含解释文字。
 * 校验：必须是数组；每项含 word/meaning/example 三字段且为非空字符串。
 * 失败一律抛 Error（调用方/IPC handler 捕获后透传给渲染端展示）。
 */
export function parseVocabArray(text: string): VocabEntry[] {
  const json = extractJsonBlock(text, '[', ']')
  let arr: unknown
  try {
    arr = JSON.parse(json)
  } catch (err) {
    throw new Error(`AI 返回的 JSON 解析失败：${err instanceof Error ? err.message : String(err)}`)
  }
  if (!Array.isArray(arr)) {
    throw new Error(`AI 返回的不是 JSON 数组（实际类型：${arr === null ? 'null' : typeof arr}）`)
  }
  return arr.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`AI 返回的第 ${i + 1} 项不是对象`)
    }
    const obj = item as Record<string, unknown>
    const { word, meaning, example } = obj as { word?: unknown; meaning?: unknown; example?: unknown }
    if (!isNonEmptyString(word) || !isNonEmptyString(meaning) || !isNonEmptyString(example)) {
      throw new Error(
        `AI 返回的第 ${i + 1} 项字段不全或为空（word/meaning/example 均需为非空字符串）`,
      )
    }
    const senses = parseSensesField(obj.senses) // 可选一词多义（宽容降级）
    return senses ? { word, meaning, example, senses } : { word, meaning, example }
  })
}

/**
 * 解析 AI 返回的翻译对象（容错版）。
 * 校验：必须是对象（非数组）；含 meaning/example 两字段且为非空字符串。
 */
export function parseVocabObject(text: string): Translation {
  const json = extractJsonBlock(text, '{', '}')
  let obj: unknown
  try {
    obj = JSON.parse(json)
  } catch (err) {
    throw new Error(`AI 返回的 JSON 解析失败：${err instanceof Error ? err.message : String(err)}`)
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error(`AI 返回的不是 JSON 对象`)
  }
  const o = obj as { meaning?: unknown; example?: unknown; senses?: unknown }
  const { meaning, example } = o
  if (!isNonEmptyString(meaning) || !isNonEmptyString(example)) {
    throw new Error('AI 返回的字段不全或为空（meaning/example 均需为非空字符串）')
  }
  const senses = parseSensesField(o.senses) // 可选一词多义（宽容降级）
  return senses ? { meaning, example, senses } : { meaning, example }
}

// Prompt 终稿（计划 2026-07-27-ai-content-generation.md §prompt 设计）：
// 严格指定 JSON 输出格式 + 雅思向用词偏好；user 模板按调用动态填入。

const THEME_GEN_SYSTEM = `你是雅思词汇专家，帮备考雅思（目标 7+）的中国大学生生成主题相关的高频学术词组。
要求：
- word：英文单词或词组（雅思写作/口语高频学术词，避免太基础的如 good/bad/big）
- meaning：简明中文释义，开头标注词性缩写（如 n. / v. / adj. / adv. / phr.），格式「词性 释义」，例如「v. 放弃；抛弃」
- example：地道英文例句，体现该词用法
- senses：该词的多义项数组（一词多义），按常用度排序最多 4 个，每项 {"pos":"n.","meaning":"该词性下的简明中文释义"}；明显单义的词只给 1 个。meaning 字段须等于 senses 第一个义项的拼接（pos+空格+meaning）
严格返回 JSON 数组，每个元素 {"word","meaning","example","senses"}，不要任何额外文字、不要 markdown 代码块。`

const TRANSLATE_SYSTEM = `你是雅思词汇助手。给定英文词，返回中文释义、地道英文例句与多义项。
- meaning：最常用义项的简明中文释义，开头标注词性缩写，格式「词性 释义」，例如「v. 放弃；抛弃」
- example：地道英文例句
- senses：该词的多义项数组，按常用度排序最多 4 个，每项 {"pos":"n.","meaning":"该词性下的简明中文释义"}；明显单义的词只给 1 个。meaning 字段须等于 senses 第一个义项的拼接（pos+空格+meaning）
严格返回 JSON {"meaning","example","senses"}，不要额外文字、不要代码块。`

/** key 没配的统一错误文案（IPC handler 渲染端展示用） */
const NO_KEY_MSG = '请先在设置配置 DeepSeek API key'

/**
 * 主题词组生成：AI 产出 n 个雅思向词组（预览，不入库——入库由前端勾选后循环 vocab:add）。
 * 调用约束：maxTokens 4000（容纳 30 词 JSON）、temperature 0.7（生成类略活泼）、timeoutMs 90s。
 * key 没配 / 网络 / 解析错误一律 throw，IPC handler 透传 message 给渲染端。
 */
export async function generateThemeVocab(theme: string, n = 30): Promise<VocabEntry[]> {
  if (!theme.trim()) throw new Error('主题不能为空')
  const cfg = getAiConfig()
  if (!cfg.apiKey) throw new Error(NO_KEY_MSG)
  const text = await callDeepseek(cfg, {
    system: THEME_GEN_SYSTEM,
    user: `主题：「${theme}」。生成 ${n} 个雅思高频词组。`,
    // 8000 容纳 30 词 JSON + pro 模型 reasoning_content 思考预算；
    // flash 默认用不满但成本可忽略，pro 不够会截断 JSON 导致解析失败误导用户。
    maxTokens: 8000,
    temperature: 0.7,
    timeoutMs: 90_000,
  })
  return parseVocabArray(text)
}

/**
 * 生词 AI 翻译：AI 返回 {meaning, example}（预览，不入库——前端填入新增卡片供用户过目修改）。
 * maxTokens 4000（单词翻译远够；统一上限留余量，成本忽略）。
 * disableThinking：翻译是简单任务，写死关思考——省 token + 出词更快（主题生成则保留思考）。
 */
export async function translateVocab(word: string): Promise<Translation> {
  if (!word.trim()) throw new Error('词不能为空')
  const cfg = getAiConfig()
  if (!cfg.apiKey) throw new Error(NO_KEY_MSG)
  const text = await callDeepseek(cfg, {
    system: TRANSLATE_SYSTEM,
    user: `词：「${word}」`,
    maxTokens: 4000,
    temperature: 0.7,
    timeoutMs: 90_000,
    disableThinking: true,
  })
  return parseVocabObject(text)
}
