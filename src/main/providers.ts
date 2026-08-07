// ============================================================================
// AI 供应商（Provider）多配置体系：取代旧"写死 DeepSeek 单模型"。
// 设计（用户拍板）：
//   - 文本/图像两类模型；每类支持 OpenAI / Gemini 两种协议（Gemini 本期留架子）
//   - 可配多个供应商；模型默认 /models 拉取，失败可手填 model_id
//   - key 只存本地（electron-store，主进程用，不进渲染明文）
//   - 使用时在配置视图勾选当前模型（selectedModel）
// 本文件是纯数据层：类型 + CRUD + 默认模板 + 迁移。不碰网络（协议调用在 ai.ts）。
// ============================================================================

/** 协议类型：openai=OpenAI 兼容（chat.completions / models）；gemini=Gemini（本期留架子） */
export type AiProtocol = 'openai' | 'gemini'
/** 模型类别：text=文本（翻译/优化/生成）；image=图像（A2 截图翻译铺路，本期只配不调） */
export type ModelKind = 'text' | 'image'

/** 一个 AI 供应商配置 */
export interface Provider {
  id: string
  name: string
  kind: ModelKind
  protocol: AiProtocol
  baseUrl: string
  apiKey: string
  models: string[]        // 拉取到的模型列表 或 用户手填的 model_id
  selectedModel: string   // 当前勾选使用的模型（models 之一，或手填值）
}

/** 渲染端展示用的脱敏 Provider：apiKey 仅返回"是否已配置"，不回传明文 */
export interface ProviderView extends Omit<Provider, 'apiKey'> {
  hasKey: boolean
}

// —— 默认供应商模板（添加时的预填，省得用户记 baseUrl）——
// brand：品牌标识（前端据此渲染彩色首字母徽标，参考 CC Switch 在名称旁显示品牌图标）。
// baseUrl 注意：Kimi for Coding 是独立端点 api.kimi.com/coding/v1（key=sk-kimi-*），
// 与 moonshot 主站 api.moonshot.cn/v1 的 key 不通用，配错会 401。
export interface ProviderTemplate {
  name: string
  kind: ModelKind
  protocol: AiProtocol
  baseUrl: string
  defaultModel: string
  brand: string // 品牌 key：'deepseek'|'kimi'|'glm'|'aliyun'|'gemini'|'custom'
}
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { name: 'DeepSeek', kind: 'text', protocol: 'openai', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-flash', brand: 'deepseek' },
  { name: 'Kimi', kind: 'text', protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2', brand: 'kimi' },
  { name: 'Kimi for Coding', kind: 'text', protocol: 'openai', baseUrl: 'https://api.kimi.com/coding/v1', defaultModel: 'kimi-for-coding', brand: 'kimi-for-coding' },
  { name: '智谱 GLM', kind: 'text', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4.5-flash', brand: 'glm' },
  { name: '阿里百炼（文本）', kind: 'text', protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus', brand: 'aliyun' },
  { name: '阿里百炼（图像）', kind: 'image', protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-vl-ocr', brand: 'aliyun' },
  { name: 'Gemini（文本）', kind: 'text', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.0-flash', brand: 'gemini' },
]

/** 简易 id 生成（时间戳+随机，本机够用，无需 uuid 依赖） */
export function genProviderId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// ============================================================================
// 模型列表拉取：默认 GET {baseUrl}/models（OpenAI 格式），失败则抛错由前端降级为手填。
// ============================================================================

// OpenAI /models 响应的最小结构：{ data: [{ id }] }（兼容部分服务返回 { models: [{name}] }）
interface ModelsListResponse {
  data?: { id?: string; name?: string }[]
  models?: { id?: string; name?: string }[]
}

/**
 * 拉取供应商的可用模型列表，返回模型 id 数组。
 * - openai → GET {baseUrl}/models（Bearer 认证），取 data[].id（兜底 models[].id/name）
 * - gemini → 留架子（Google 列表结构不同，本期未接入，抛错提示手填）
 * 网络/HTTP/解析失败一律 throw，前端 catch 后允许手填 model_id。
 */
export async function fetchProviderModels(
  baseUrl: string,
  apiKey: string,
  protocol: AiProtocol,
): Promise<string[]> {
  if (protocol === 'gemini') {
    throw new Error('Gemini 协议暂不支持自动拉取模型列表，请手动填写 model_id')
  }
  if (!apiKey.trim()) throw new Error('请先填写 API key 再拉取模型列表')
  const url = `${baseUrl.replace(/\/+$/, '')}/models`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
  } catch (err) {
    throw new Error(
      err instanceof Error && err.name === 'AbortError'
        ? '拉取模型列表超时——可手动填写 model_id'
        : `拉取模型列表失败：${err instanceof Error ? err.message : String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    throw new Error(`拉取模型列表失败 HTTP ${res.status}——可手动填写 model_id`)
  }
  const data = (await res.json()) as ModelsListResponse
  // 优先 OpenAI 的 data[].id；兼容部分服务的 models[].id / models[].name（如 Gemini 风格 name 字段）
  const ids = (data.data ?? data.models ?? [])
    .map((m) => (m.id ?? m.name ?? '').trim())
    .filter((s) => s.length > 0)
  if (ids.length === 0) throw new Error('模型列表为空或格式无法识别——请手动填写 model_id')
  return ids
}

// ============================================================================
// CRUD 纯函数：输入 providers 数组，输出新数组（不改动原数组，便于测试）。
// store 层负责读写 settingsBox，这里只管数组变换逻辑。
// ============================================================================

export function addProvider(list: Provider[], p: Provider): Provider[] {
  return [...list, p]
}

export function updateProvider(list: Provider[], id: string, patch: Partial<Omit<Provider, 'id'>>): Provider[] {
  return list.map((p) => (p.id === id ? { ...p, ...patch } : p))
}

export function removeProvider(list: Provider[], id: string): Provider[] {
  return list.filter((p) => p.id !== id)
}

/** 选中某供应商的模型：仅更新该 provider 的 selectedModel */
export function selectProviderModel(list: Provider[], id: string, model: string): Provider[] {
  return list.map((p) => (p.id === id ? { ...p, selectedModel: model } : p))
}

/** 取某类别当前激活的供应商：优先有 selectedModel 且有 key 的；同类多个取第一个可用的 */
export function activeProvider(list: Provider[], kind: ModelKind): Provider | null {
  const ofKind = list.filter((p) => p.kind === kind)
  return ofKind.find((p) => p.selectedModel && p.apiKey) ?? ofKind.find((p) => p.apiKey) ?? ofKind[0] ?? null
}

/** 取某类别当前激活供应商，显式 activeId 优先（CC Switch 式"当前使用"标记）；空/失效则回退 activeProvider 启发式 */
export function activeProviderById(list: Provider[], kind: ModelKind, activeId: string): Provider | null {
  const ofKind = list.filter((p) => p.kind === kind)
  const chosen = ofKind.find((p) => p.id === activeId)
  return chosen ?? activeProvider(list, kind)
}

/** 脱敏视图：把 apiKey 换成 hasKey 标志，供渲染端展示（key 不出主进程明文） */
export function toProviderView(p: Provider): ProviderView {
  const { apiKey, ...rest } = p
  return { ...rest, hasKey: apiKey.trim().length > 0 }
}

// ============================================================================
// 迁移：旧三键（ai_provider/ai_api_key/ai_base_url/ai_model）→ 首个 Provider。
// 幂等：已有 providers 或旧 key 为空则不动。旧键保留（向后兼容，下次清理）。
// ============================================================================
export function migrateLegacyAiKey(
  oldSettings: Record<string, string>,
  existing: Provider[],
): Provider[] | null {
  if (existing.length > 0) return null // 已有新体系，不迁移
  const oldKey = (oldSettings.ai_api_key ?? '').trim()
  if (!oldKey) return null // 旧 key 都没配，无可迁移
  const legacy: Provider = {
    id: genProviderId(),
    name: 'DeepSeek（迁移）',
    kind: 'text',
    protocol: 'openai',
    baseUrl: (oldSettings.ai_base_url ?? '').trim() || 'https://api.deepseek.com',
    apiKey: oldKey,
    models: [(oldSettings.ai_model ?? '').trim() || 'deepseek-v4-flash'],
    selectedModel: (oldSettings.ai_model ?? '').trim() || 'deepseek-v4-flash',
  }
  return [legacy]
}
