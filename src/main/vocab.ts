import { allocId, vocabBox, trashBox, setSrsState, setSrsStateBatch, deleteSrsState, getPopCount, peekNextId, reserveNextId } from './store'
import type { Sense } from '../shared/ipc-types'

export type { Sense }

export interface VocabItem {
  id: number; word: string; meaning: string; example: string
  topic: string | null
  book: string | null                 // 来源词书 id；手动添加/种子词为 null
  status: 'new' | 'learning' | 'review' | 'mastered' // 生命周期四态：新词未解锁/学习中(轮回内)/复习中(轮回外)/已掌握(背完不再弹)
  source: string; created_at: number
  // —— 一词多义（增量字段，undefined=单义词/旧数据，一切照旧）——
  senses?: Sense[]          // 全部义项（多义词才有）；meaning 保留为默认义项，旧展示零破坏
  selectedSenses?: number[] // 用户勾选要在弹窗显示的义项下标（限 3 个）；undefined=只显示默认义项
}
export type NewVocabItem = Omit<VocabItem, 'id' | 'created_at' | 'status' | 'book'> & {
  status?: VocabItem['status'] // 可选：调用方显式指定（如 revive 类场景）；不传默认 'new' 走统一队列
  book?: string | null         // 可选：词书导入传词书 id，其余默认 null
}

// 归一化（查重专用）：trim + 小写。入库的 word 仍按原样存，不强制改小写。
const norm = (s: string): string => s.trim().toLowerCase()

export function addVocab(e: NewVocabItem): VocabItem {
  // 同词导入拦截：归一化后与生词库、回收站（含回收站防还原后重复）逐一比对。
  // 词书批量导入虽有自己的 inLib 跳过逻辑，但并发/边界场景仍可能漏过，这里做最终兜底。
  // 文案区分（用户决策）：词库已有 → "已在生词库"；回收站已有 → "在回收站"。
  // 上层 isDupError/seed/AiGenModal 都用 /已在生词库|在回收站/ 统一识别为 dup。
  const w = norm(e.word)
  if (vocabBox.get().some((it) => norm(it.word) === w)) {
    throw new Error(`「${e.word}」已在生词库中，不支持重复导入`)
  }
  if (trashBox.get().some((t) => norm(t.item.word) === w)) {
    throw new Error(`「${e.word}」在回收站中，先还原或彻底删除后才能重新加入`)
  }
  // status/book 调用方一般不传，这里兜底：统一默认 'new'（新词一律进待学队列，
  // 由 fillLearningQueue 按 learning_cap 实时补位——手动/AI/词书同一套规则，分界线始终可见）。
  const item: VocabItem = {
    ...e, status: e.status ?? 'new', book: e.book ?? null,
    id: allocId(), created_at: Date.now(),
  }
  vocabBox.set([...vocabBox.get(), item])
  setSrsState(item.id, { easiness: 2.5, repetitions: 0, duePop: getPopCount(), forgotCount: 0 }) // 初始 SRS；new 词被补位提升时会重置为当时 popCount
  return item
}

// 批量添加（修"导入 200 词卡顿"）：
// 根因——addVocab 每词 3 次全量同步写盘（nextId/vocab/srsStates），200 词≈600 次写盘阻塞主进程。
// 这里改成：一次读库建查重 Set → 全程内存组装（连续分配 id、push vocab、塞 srsStates）→ 三次写盘收尾。
// 语义与 addVocab 完全一致：库内查重 + 批内查重，撞词跳过不中断，返回实际加入条数。
// 与 addVocab 的差异：addVocab 撞词抛错（供单条手动添加提示），批量版撞词静默跳过（供整批导入）。
export function addVocabBatch(items: NewVocabItem[]): number {
  if (items.length === 0) return 0
  const vocab = vocabBox.get()
  const trash = trashBox.get()
  // 库内已占用的词（生词库 + 回收站），归一化后建 Set，批量里 O(1) 复用查重
  const taken = new Set<string>([
    ...vocab.map((it) => norm(it.word)),
    ...trash.map((t) => norm(t.item.word)),
  ])
  const now = getPopCount()
  const ts = Date.now()
  // 内存里连续分配 id：peek 读一次起点（不写盘），循环内存递增，结尾 reserve 一次写盘
  let nextId = peekNextId()
  const newItems: VocabItem[] = []
  const newSrs: Record<number, { easiness: number; repetitions: number; duePop: number; forgotCount: number }> = {}
  for (const e of items) {
    const w = norm(e.word)
    if (taken.has(w)) continue // 库内已有 / 批内已加（taken 会在下面同步加入新词）→ 跳过
    taken.add(w) // 批内查重：本批后面的同词也跳过
    const item: VocabItem = {
      ...e, status: e.status ?? 'new', book: e.book ?? null,
      id: nextId++, created_at: ts,
    }
    newItems.push(item)
    newSrs[item.id] = { easiness: 2.5, repetitions: 0, duePop: now, forgotCount: 0 }
  }
  if (newItems.length === 0) return 0
  // 三次写盘收尾：vocab 追加、srsStates 合并、nextId 一次性推进（替代逐词各写一次）
  vocabBox.set([...vocab, ...newItems])
  setSrsStateBatch(newSrs)
  reserveNextId(newItems.length)
  return newItems.length
}

export function listVocab(): VocabItem[] {
  return [...vocabBox.get()].sort((a, b) => a.id - b.id)
}

export function updateVocab(id: number, patch: Partial<NewVocabItem>): void {
  vocabBox.set(
    vocabBox.get().map(e => (e.id === id ? { ...e, ...patch } : e))
  )
}

export function deleteVocab(id: number): void {
  // 软删除：从 vocab 移除 → 包装进 trash（保留 srsState 供还原）。
  // 找不到该词（已删/不存在）→ no-op，不往 trash 塞空条目。
  const item = vocabBox.get().find((e) => e.id === id)
  if (!item) return
  vocabBox.set(vocabBox.get().filter((e) => e.id !== id))
  trashBox.set([...trashBox.get(), { item, deletedAt: Date.now() }])
}

// 硬删除：从 vocab 真删 + 清 srsState，不进回收站。
// 用于主动批量清除场景（如移除整本词书）——非误删，不堆回收站，避免重加时 inLib 盲区导致重复入库。
export function hardDeleteVocab(id: number): void {
  vocabBox.set(vocabBox.get().filter((e) => e.id !== id))
  deleteSrsState(id)
}

// 回收站列表，按 deletedAt 倒序（最近删的在上）
export function listTrash(): { item: VocabItem; deletedAt: number }[] {
  return [...trashBox.get()].sort((a, b) => b.deletedAt - a.deletedAt)
}

// 还原：从 trash 取回 item 放回 vocab，trash 移除。srsState 不动（自然恢复到期/计数）。
export function restoreVocab(id: number): void {
  const entry = trashBox.get().find((e) => e.item.id === id)
  if (!entry) return
  vocabBox.set([...vocabBox.get(), entry.item])
  trashBox.set(trashBox.get().filter((e) => e.item.id !== id))
}

// 彻底删除：trash 真删该条 + 清对应 srsState（不可恢复）
export function purgeVocab(id: number): void {
  const exists = trashBox.get().some((e) => e.item.id === id)
  if (!exists) return
  trashBox.set(trashBox.get().filter((e) => e.item.id !== id))
  deleteSrsState(id)
}

// 清空回收站：trash 清空 + 删所有 trash 词的 srsState
export function clearTrash(): void {
  const ids = trashBox.get().map((e) => e.item.id)
  trashBox.set([])
  for (const id of ids) deleteSrsState(id)
}
