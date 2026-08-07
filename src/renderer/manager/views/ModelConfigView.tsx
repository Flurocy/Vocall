import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { ProviderInput, ProviderTemplate, ProviderView } from '../../../shared/ipc-types'
import type { Theme } from '../../theme'
import { CircleNotch, ArrowLeft, Plus, Trash } from '@phosphor-icons/react'
import ConfirmModal from './ConfirmModal'
import ProviderBrandIcon from '../ProviderBrandIcon'

// 剥 Electron IPC 包装前缀（同 ExpressionsView 模式）
const errMsg = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).replace(
    /^Error invoking remote method '[^']+':\s*Error:\s*/,
    ''
  )

// 模型配置视图：管理多个 AI 供应商（文本/图像 × openai/gemini）。
// 每个供应商卡片：名称/协议徽标/baseUrl/Key/模型选择(拉取 or 手填)/删除。
// key 不回传明文——已配置显示"已保存"占位，留空=保持不变，填新值=覆盖。
// 风格全走现有卡片语言 + Theme token。

interface Props {
  theme: Theme
  onBack: () => void
}

const KIND_LABEL: Record<'text' | 'image', string> = { text: '文本', image: '图像' }
const PROTOCOL_LABEL: Record<'openai' | 'gemini', string> = { openai: 'OpenAI', gemini: 'Gemini' }

// 编辑表单草稿：provider 字段 + 手填模型输入框。apiKey 空=保持不变（编辑时）。
interface Draft {
  name: string
  kind: 'text' | 'image'
  protocol: 'openai' | 'gemini'
  baseUrl: string
  apiKey: string
  models: string[]
  selectedModel: string
  manualModel: string // 手填 model_id 输入框
}

export default function ModelConfigView({ theme, onBack }: Props): ReactElement {
  const [providers, setProviders] = useState<ProviderView[]>([])
  const [activeIds, setActiveIds] = useState<Record<'text' | 'image', string>>({ text: '', image: '' })
  const [templates, setTemplates] = useState<ProviderTemplate[]>([])
  // 添加表单开关 + 草稿
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  // 编辑中的 provider id（卡片内联展开编辑）；null=都不在编辑
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft | null>(null)
  // 每卡片"拉取模型"loading / 消息（key: providerId 或 'new'）
  const [fetching, setFetching] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null) // 测试连接中的 provider id
  const [msg, setMsg] = useState<{ key: string; kind: 'ok' | 'err'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<{ message: string; onOk: () => void } | null>(null)

  useEffect(() => {
    void window.vocall.getProviderState().then((s) => {
      setProviders(s.providers)
      setActiveIds(s.activeIds)
    })
    void window.vocall.getProviderTemplates().then(setTemplates)
  }, [])

  const inputCls =
    'w-full rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-black/20 focus:bg-white'

  // —— 添加 ——
  const startAdd = (tpl?: ProviderTemplate): void => {
    setDraft({
      name: tpl?.name ?? '',
      kind: tpl?.kind ?? 'text',
      protocol: tpl?.protocol ?? 'openai',
      baseUrl: tpl?.baseUrl ?? '',
      apiKey: '',
      models: [],
      selectedModel: tpl?.defaultModel ?? '',
      manualModel: tpl?.defaultModel ?? '',
    })
    setAdding(true)
    setMsg(null)
  }

  const submitAdd = async (): Promise<void> => {
    if (!draft) return
    if (!draft.name.trim()) { setMsg({ key: 'new', kind: 'err', text: '请填写供应商名称' }); return }
    if (!draft.baseUrl.trim()) { setMsg({ key: 'new', kind: 'err', text: '请填写 Base URL' }); return }
    if (!draft.apiKey.trim()) { setMsg({ key: 'new', kind: 'err', text: '请填写 API Key' }); return }
    const models = draft.models.length > 0
      ? draft.models
      : (draft.manualModel.trim() ? [draft.manualModel.trim()] : [])
    if (models.length === 0) { setMsg({ key: 'new', kind: 'err', text: '请拉取模型或手动填写 model_id' }); return }
    const input: ProviderInput = {
      name: draft.name.trim(), kind: draft.kind, protocol: draft.protocol,
      baseUrl: draft.baseUrl.trim(), apiKey: draft.apiKey.trim(),
      models, selectedModel: draft.selectedModel || models[0],
    }
    setProviders(await window.vocall.addProvider(input))
    setAdding(false)
    setDraft(null)
    setMsg(null)
  }

  // —— 编辑 ——
  const startEdit = (p: ProviderView): void => {
    setEditingId(p.id)
    setEditDraft({
      name: p.name, kind: p.kind, protocol: p.protocol, baseUrl: p.baseUrl,
      apiKey: '', // 空=保持原 key 不变
      models: p.models, selectedModel: p.selectedModel, manualModel: '',
    })
    setMsg(null)
  }

  const submitEdit = async (id: string): Promise<void> => {
    if (!editDraft) return
    const patch: Partial<ProviderInput> = {
      name: editDraft.name.trim(), baseUrl: editDraft.baseUrl.trim(),
      models: editDraft.models, selectedModel: editDraft.selectedModel,
    }
    if (editDraft.apiKey.trim()) patch.apiKey = editDraft.apiKey.trim() // 只在填了新值时覆盖
    setProviders(await window.vocall.updateProvider(id, patch))
    setEditingId(null)
    setEditDraft(null)
    setMsg(null)
  }

  // —— 拉取模型（仅已存供应商卡片；主进程用已存 key 拉取并回写）——
  // 添加草稿阶段不支持拉取：供应商未入库无 id，且 key 不落库前不应发起带 key 请求——先保存再拉取，或手填。
  const fetchModels = async (p: ProviderView): Promise<void> => {
    setFetching(p.id)
    setMsg(null)
    try {
      const models = await window.vocall.fetchProviderModels(p.id)
      setProviders(await window.vocall.listProviders())
      setMsg({ key: p.id, kind: 'ok', text: `拉取到 ${models.length} 个模型` })
    } catch (err) {
      setMsg({ key: p.id, kind: 'err', text: errMsg(err) })
    } finally {
      setFetching(null)
    }
  }

  // —— 删除 ——
  const remove = (p: ProviderView): void => {
    setConfirm({
      message: `删除供应商「${p.name}」？其 API key 与模型配置一并移除。`,
      onOk: () => {
        setConfirm(null)
        void (async () => setProviders(await window.vocall.removeProvider(p.id)))()
      },
    })
  }

  const selectModel = async (id: string, model: string): Promise<void> => {
    setProviders(await window.vocall.selectProviderModel(id, model))
  }

  // 设为"当前使用"（CC Switch 式）：写入 activeIds，该类别调用/测试都走它
  const setActive = async (p: ProviderView): Promise<void> => {
    const s = await window.vocall.setActiveProvider(p.kind, p.id)
    setProviders(s.providers)
    setActiveIds(s.activeIds)
  }

  // 测试该供应商连接：先把它设为当前，再调全局 ai:test（测当前文本供应商）。
  // 仅文本供应商可测（图像调用本期未接入）。
  const testProvider = async (p: ProviderView): Promise<void> => {
    setTesting(p.id)
    setMsg(null)
    try {
      await setActive(p) // 确保 ai:test 测的是这张卡
      const r = await window.vocall.testAi()
      setMsg({ key: `test-${p.id}`, kind: r.ok ? 'ok' : 'err', text: r.message })
    } catch (err) {
      setMsg({ key: `test-${p.id}`, kind: 'err', text: errMsg(err) })
    } finally {
      setTesting(null)
    }
  }

  // 协议/类别徽标
  const badge = (text: string, cls: string): ReactElement => (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{text}</span>
  )

  // 模型选择区（卡片与编辑共用）：有 models→列出点选；无→提示手填
  const modelPicker = (
    models: string[],
    selected: string,
    onSelect: (m: string) => void,
  ): ReactElement => (
    <div className="flex flex-wrap gap-1.5">
      {models.map((m) => (
        <button
          key={m}
          onClick={() => onSelect(m)}
          className={`rounded-full px-3 py-1 font-mono text-xs transition ${
            selected === m
              ? `${theme.accentBg} ${theme.accentText} font-semibold`
              : 'bg-black/[0.04] text-slate-600 hover:bg-black/10'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  )

  // 单张供应商卡片
  const card = (p: ProviderView): ReactElement => {
    const editing = editingId === p.id && editDraft
    const isActive = activeIds[p.kind] === p.id
    return (
      <li
        key={p.id}
        className={`rounded-xl border px-4 py-3 shadow-sm transition ${
          isActive ? 'border-black/20 bg-white/80 ring-1 ring-black/10' : 'border-black/10 bg-white/60'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <ProviderBrandIcon name={p.name} baseUrl={p.baseUrl} size={20} />
            <span className="font-medium text-slate-800">{p.name}</span>
            {isActive && badge('✓ 当前使用', `${theme.accentBg} ${theme.accentText}`)}
            {badge(KIND_LABEL[p.kind], p.kind === 'text' ? 'bg-slate-500/10 text-slate-600' : 'bg-violet-500/15 text-violet-700')}
            {badge(PROTOCOL_LABEL[p.protocol], 'bg-slate-500/10 text-slate-600')}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!isActive && (
              <button
                onClick={() => void setActive(p)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition ${theme.accentText} hover:bg-black/5`}
              >
                设为当前
              </button>
            )}
            <button
              onClick={() => (editing ? (setEditingId(null), setEditDraft(null)) : startEdit(p))}
              className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-black/5 hover:text-slate-600"
            >
              {editing ? '收起' : '编辑'}
            </button>
            <button
              onClick={() => remove(p)}
              aria-label={`删除 ${p.name}`}
              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-600"
            >
              <Trash size={14} />
            </button>
          </div>
        </div>

        {!editing && (
          <div className="mt-2 space-y-2">
            <div className="truncate font-mono text-xs text-slate-500">{p.baseUrl}</div>
            <div className="text-xs text-slate-500">
              API Key：{p.hasKey ? <span className={theme.accentText}>已保存</span> : <span className="text-rose-600">未配置</span>}
            </div>
            {/* 模型选择：当前选中的高亮 */}
            {p.models.length > 0 ? (
              <div>
                <div className="mb-1 text-xs text-slate-500">模型（点击切换当前使用）：</div>
                {modelPicker(p.models, p.selectedModel, (m) => void selectModel(p.id, m))}
              </div>
            ) : (
              <div className="text-xs text-slate-400">尚未配置模型——点「编辑」拉取或手填</div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => void fetchModels(p)}
                disabled={fetching === p.id}
                className="flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-black/5 disabled:opacity-40"
              >
                {fetching === p.id ? <CircleNotch size={12} className="animate-spin" /> : null}
                {p.models.length > 0 ? '重新拉取模型' : '拉取模型列表'}
              </button>
              {/* 测试连接：仅文本供应商（图像调用本期未接入） */}
              {p.kind === 'text' && (
                <button
                  onClick={() => void testProvider(p)}
                  disabled={testing === p.id || !p.hasKey}
                  className="flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-black/5 disabled:opacity-40"
                >
                  {testing === p.id ? <CircleNotch size={12} className="animate-spin" /> : null}
                  测试连接
                </button>
              )}
              {msg && msg.key === p.id && (
                <span className={`text-xs ${msg.kind === 'ok' ? theme.accentText : 'text-rose-600'}`}>{msg.text}</span>
              )}
              {msg && msg.key === `test-${p.id}` && (
                <span className={`text-xs ${msg.kind === 'ok' ? theme.accentText : 'text-rose-600'}`}>{msg.text}</span>
              )}
            </div>
          </div>
        )}

        {/* 编辑面板 */}
        {editing && (
          <div className="mt-3 space-y-3 rounded-lg bg-black/[0.03] p-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-600">名称</span>
                <input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-600">Base URL</span>
                <input value={editDraft.baseUrl} onChange={(e) => setEditDraft({ ...editDraft, baseUrl: e.target.value })} className={`${inputCls} font-mono text-xs`} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">API Key{editDraft.apiKey ? '（已填写新值）' : '（留空保持不变）'}</span>
              <input type="password" value={editDraft.apiKey} onChange={(e) => setEditDraft({ ...editDraft, apiKey: e.target.value })} placeholder={p.hasKey ? '已保存，留空保持不变' : 'sk-...'} className={inputCls} />
            </label>
            {/* 手填 model_id */}
            <div className="flex gap-2">
              <input
                value={editDraft.manualModel}
                onChange={(e) => setEditDraft({ ...editDraft, manualModel: e.target.value })}
                placeholder="手动填写 model_id，回车加入"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editDraft.manualModel.trim()) {
                    const m = editDraft.manualModel.trim()
                    if (!editDraft.models.includes(m)) {
                      setEditDraft({ ...editDraft, models: [...editDraft.models, m], selectedModel: editDraft.selectedModel || m, manualModel: '' })
                    } else setEditDraft({ ...editDraft, manualModel: '' })
                  }
                }}
                className={`${inputCls} font-mono text-xs`}
              />
            </div>
            {editDraft.models.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-slate-600">模型（点击设为当前）：</div>
                {modelPicker(editDraft.models, editDraft.selectedModel, (m) => setEditDraft({ ...editDraft, selectedModel: m }))}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              {msg && msg.key === `edit-${p.id}` && (
                <span className={`mr-auto text-xs ${msg.kind === 'ok' ? theme.accentText : 'text-rose-600'}`}>{msg.text}</span>
              )}
              <button onClick={() => { setEditingId(null); setEditDraft(null) }} className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-slate-600 hover:bg-black/5">取消</button>
              <button onClick={() => void submitEdit(p.id)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${theme.accentSolid} ${theme.accentSolidHover}`}>保存</button>
            </div>
          </div>
        )}
      </li>
    )
  }

  const textProviders = providers.filter((p) => p.kind === 'text')
  const imageProviders = providers.filter((p) => p.kind === 'image')

  return (
    <div className="mx-auto max-w-2xl">
      {/* 顶部：返回 + 标题 + 添加 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="返回设置" className="flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-black/5">
            <ArrowLeft size={14} /> 设置
          </button>
          <h2 className="text-xl font-semibold">模型配置</h2>
        </div>
        <button
          onClick={() => (adding ? (setAdding(false), setDraft(null)) : startAdd(templates[0]))}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${theme.accentSolid} ${theme.accentSolidHover}`}
        >
          <Plus size={14} weight="bold" /> {adding ? '收起' : '添加供应商'}
        </button>
      </div>

      {/* 添加表单 */}
      {adding && draft && (
        <section className="mb-4 rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm">
          {/* 模板快选 */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">快速预填：</span>
            {templates.map((t) => (
              <button key={t.name} onClick={() => startAdd(t)} className="flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-xs text-slate-600 transition hover:bg-black/10">
                <ProviderBrandIcon name={t.name} baseUrl={t.baseUrl} brand={t.brand} size={14} />
                {t.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">名称</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="如：我的 DeepSeek" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">Base URL</span>
              <input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="https://..." className={`${inputCls} font-mono text-xs`} />
            </label>
          </div>
          {/* 类别 + 协议 */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1 block text-xs text-slate-600">模型类别</span>
              <div className="flex gap-1.5">
                {(['text', 'image'] as const).map((k) => (
                  <button key={k} onClick={() => setDraft({ ...draft, kind: k })} className={`flex-1 rounded-lg px-3 py-1.5 text-sm transition ${draft.kind === k ? `${theme.accentBg} ${theme.accentText} font-medium` : 'text-slate-600 hover:bg-black/5'}`}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs text-slate-600">协议</span>
              <div className="flex gap-1.5">
                {(['openai', 'gemini'] as const).map((pr) => (
                  <button key={pr} onClick={() => setDraft({ ...draft, protocol: pr })} className={`flex-1 rounded-lg px-3 py-1.5 text-sm transition ${draft.protocol === pr ? `${theme.accentBg} ${theme.accentText} font-medium` : 'text-slate-600 hover:bg-black/5'}`}>
                    {PROTOCOL_LABEL[pr]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs text-slate-600">API Key（仅保存本机）</span>
            <input type="password" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} placeholder="sk-..." className={inputCls} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs text-slate-600">模型（先保存后可在线拉取；此处可手填 model_id）</span>
            <input value={draft.manualModel} onChange={(e) => setDraft({ ...draft, manualModel: e.target.value })} placeholder={draft.protocol === 'gemini' ? 'gemini-2.0-flash' : 'deepseek-v4-flash'} className={`${inputCls} font-mono text-xs`} />
          </label>
          <div className="mt-3 flex items-center justify-end gap-2">
            {msg && msg.key === 'new' && (
              <span className={`mr-auto text-xs ${msg.kind === 'ok' ? theme.accentText : 'text-rose-600'}`}>{msg.text}</span>
            )}
            <button onClick={() => { setAdding(false); setDraft(null); setMsg(null) }} className="rounded-lg border border-black/10 px-4 py-2 text-sm text-slate-600 hover:bg-black/5">取消</button>
            <button onClick={() => void submitAdd()} className={`rounded-lg px-4 py-2 text-sm font-medium ${theme.accentSolid} ${theme.accentSolidHover}`}>保存供应商</button>
          </div>
        </section>
      )}

      {/* 文本模型组 */}
      <section className="mb-4">
        <h3 className={`mb-2 text-sm font-medium ${theme.accentText}`}>文本模型（翻译 / 句子优化 / 主题生成）</h3>
        {textProviders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-4 py-6 text-center text-sm text-slate-500">
            还没有文本模型供应商，点右上角「添加供应商」
          </div>
        ) : (
          <ul className="space-y-2.5">{textProviders.map(card)}</ul>
        )}
      </section>

      {/* 图像模型组 */}
      <section>
        <h3 className={`mb-2 text-sm font-medium ${theme.accentText}`}>图像模型（截图翻译 · 即将上线）</h3>
        {imageProviders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-4 py-6 text-center text-sm text-slate-500">
            还没有图像模型供应商（为截图翻译预留）
          </div>
        ) : (
          <ul className="space-y-2.5">{imageProviders.map(card)}</ul>
        )}
      </section>

      {/* 自绘确认弹窗（删除供应商） */}
      {confirm && (
        <ConfirmModal theme={theme} message={confirm.message} onOk={confirm.onOk} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
