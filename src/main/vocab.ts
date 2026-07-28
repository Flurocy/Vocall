import { allocId, vocabBox, trashBox, setSrsState, deleteSrsState, getPopCount } from './store'

export interface VocabItem {
  id: number; word: string; meaning: string; example: string
  topic: string | null
  book: string | null                 // 来源词书 id；手动添加/种子词为 null
  status: 'new' | 'learning' | 'review' | 'mastered' // 生命周期四态：新词未解锁/学习中(轮回内)/复习中(轮回外)/已掌握(背完不再弹)
  source: string; created_at: number
}
export type NewVocabItem = Omit<VocabItem, 'id' | 'created_at' | 'status' | 'book'> & {
  status?: VocabItem['status'] // 可选：词书导入传 'new'，其余默认 'learning'
  book?: string | null         // 可选：词书导入传词书 id，其余默认 null
}

export function addVocab(e: NewVocabItem): VocabItem {
  // status/book 调用方一般不传，这里兜底：手动/种子词默认 learning、book null。
  // 词书导入的包4 会显式传 status:'new'、book:词书id（此时 e 的值覆盖默认）。
  const item: VocabItem = {
    ...e, status: e.status ?? 'learning', book: e.book ?? null,
    id: allocId(), created_at: Date.now(),
  }
  vocabBox.set([...vocabBox.get(), item])
  setSrsState(item.id, { easiness: 2.5, repetitions: 0, duePop: getPopCount(), forgotCount: 0 }) // 立即可弹
  return item
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
