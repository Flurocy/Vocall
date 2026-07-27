import { allocId, vocabBox, setSrsState, deleteSrsState, getPopCount } from './store'

export interface VocabItem {
  id: number; word: string; meaning: string; example: string
  topic: string | null
  book: string | null                 // 来源词书 id；手动添加/种子词为 null
  status: 'new' | 'learning' | 'review' // 生命周期三态：新词未解锁/学习中(轮回内)/复习中(轮回外)
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
  setSrsState(item.id, { easiness: 2.5, repetitions: 0, duePop: getPopCount() }) // 立即可弹
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
  vocabBox.set(vocabBox.get().filter(e => e.id !== id))
  deleteSrsState(id)
}
