import { allocId, vocabBox, setSrsState, deleteSrsState } from './store'

export interface VocabItem {
  id: number; word: string; meaning: string; example: string
  topic: string | null; source: string; created_at: number
}
export type NewVocabItem = Omit<VocabItem, 'id' | 'created_at'>

export function addVocab(e: NewVocabItem): VocabItem {
  const item: VocabItem = { ...e, id: allocId(), created_at: Date.now() }
  vocabBox.set([...vocabBox.get(), item])
  setSrsState(item.id, {
    easiness: 2.5, interval: 0, repetitions: 0,
    due_at: Date.now(), last_reviewed: null,
  })
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
