import { describe, it, expect } from 'vitest'
import {
  addProvider, updateProvider, removeProvider, selectProviderModel,
  activeProvider, toProviderView, migrateLegacyAiKey,
  type Provider,
} from '../src/main/providers'

// B? 模型配置体系：providers 数据层纯函数测试（CRUD / 激活选择 / 脱敏 / 迁移）

function prov(partial: Partial<Provider> & { id: string }): Provider {
  return {
    name: 'X', kind: 'text', protocol: 'openai',
    baseUrl: '', apiKey: '', models: [], selectedModel: '', ...partial,
  }
}

describe('providers CRUD', () => {
  it('addProvider：追加且不改原数组', () => {
    const a = [prov({ id: 'p1' })]
    const b = addProvider(a, prov({ id: 'p2' }))
    expect(b).toHaveLength(2)
    expect(a).toHaveLength(1) // 原数组不变
  })

  it('updateProvider：只改目标 id，且不动原数组', () => {
    const a = [prov({ id: 'p1', name: 'old' }), prov({ id: 'p2' })]
    const b = updateProvider(a, 'p1', { name: 'new', apiKey: 'sk-x' })
    expect(b[0].name).toBe('new')
    expect(b[0].apiKey).toBe('sk-x')
    expect(b[1].name).toBe('X') // 其他不动
    expect(a[0].name).toBe('old') // 原数组不变
  })

  it('removeProvider：删除目标，其余保留', () => {
    const a = [prov({ id: 'p1' }), prov({ id: 'p2' }), prov({ id: 'p3' })]
    expect(removeProvider(a, 'p2').map((p) => p.id)).toEqual(['p1', 'p3'])
  })

  it('selectProviderModel：仅更新该 provider 的 selectedModel', () => {
    const a = [prov({ id: 'p1', selectedModel: 'm1' }), prov({ id: 'p2', selectedModel: 'm9' })]
    const b = selectProviderModel(a, 'p1', 'm2')
    expect(b[0].selectedModel).toBe('m2')
    expect(b[1].selectedModel).toBe('m9')
  })
})

describe('activeProvider —— 取某类别当前激活供应商', () => {
  it('优先有 selectedModel 且有 key 的', () => {
    const list = [
      prov({ id: 'p1', kind: 'text', apiKey: 'k', selectedModel: '' }), // 有 key 没选模型
      prov({ id: 'p2', kind: 'text', apiKey: 'k', selectedModel: 'm' }), // 有 key 有模型 → 应选它
    ]
    expect(activeProvider(list, 'text')?.id).toBe('p2')
  })

  it('没有完全体时退而有 key 的', () => {
    const list = [prov({ id: 'p1', kind: 'text', apiKey: 'k', selectedModel: '' })]
    expect(activeProvider(list, 'text')?.id).toBe('p1')
  })

  it('按类别过滤：image 不影响 text', () => {
    const list = [prov({ id: 'pi', kind: 'image', apiKey: 'k', selectedModel: 'm' })]
    expect(activeProvider(list, 'text')).toBeNull()
    expect(activeProvider(list, 'image')?.id).toBe('pi')
  })

  it('空列表：null', () => {
    expect(activeProvider([], 'text')).toBeNull()
  })
})

describe('toProviderView —— 脱敏（key 不出主进程明文）', () => {
  it('有 key → hasKey=true，且不含 apiKey 字段', () => {
    const v = toProviderView(prov({ id: 'p1', apiKey: 'sk-secret' }))
    expect(v.hasKey).toBe(true)
    expect((v as Record<string, unknown>).apiKey).toBeUndefined()
  })
  it('空/纯空白 key → hasKey=false', () => {
    expect(toProviderView(prov({ id: 'p1', apiKey: '' })).hasKey).toBe(false)
    expect(toProviderView(prov({ id: 'p1', apiKey: '   ' })).hasKey).toBe(false)
  })
})

describe('migrateLegacyAiKey —— 旧三键迁移', () => {
  it('已有 providers：不迁移（幂等）', () => {
    const existing = [prov({ id: 'p1' })]
    expect(migrateLegacyAiKey({ ai_api_key: 'sk-x' }, existing)).toBeNull()
  })

  it('旧 key 为空：不迁移', () => {
    expect(migrateLegacyAiKey({}, [])).toBeNull()
    expect(migrateLegacyAiKey({ ai_api_key: '  ' }, [])).toBeNull()
  })

  it('旧 key 存在：迁移成首个 DeepSeek provider，带默认/model 兜底', () => {
    const out = migrateLegacyAiKey({ ai_api_key: 'sk-old', ai_model: 'deepseek-pro' }, [])
    expect(out).toHaveLength(1)
    const p = out![0]
    expect(p.kind).toBe('text')
    expect(p.protocol).toBe('openai')
    expect(p.apiKey).toBe('sk-old')
    expect(p.selectedModel).toBe('deepseek-pro')
    expect(p.baseUrl).toBe('https://api.deepseek.com') // 默认兜底
  })

  it('旧 model 为空：落默认模型', () => {
    const out = migrateLegacyAiKey({ ai_api_key: 'sk-old' }, [])
    expect(out![0].selectedModel).toBe('deepseek-v4-flash')
  })
})
