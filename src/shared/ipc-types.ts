export interface VocabItem {
  id: number; word: string; meaning: string; example: string
  topic: string | null; source: string; created_at: number
}
export type NewVocabItem = Omit<VocabItem, 'id' | 'created_at'>

// 渲染端可调用的接口形状
export interface TasymizeApi {
  listVocab(): Promise<VocabItem[]>
  addVocab(e: NewVocabItem): Promise<number>
  updateVocab(id: number, patch: Partial<NewVocabItem>): Promise<void>
  deleteVocab(id: number): Promise<void>
  getSettings(): Promise<Record<string, string>>
  setSetting(key: string, value: string): Promise<void>
  onShow(cb: (expr: VocabItem) => void): void
  getCurrent(): Promise<VocabItem | null>
  grade(id: number, grade: 0 | 1 | 2): Promise<void>
  dismiss(): void
}

declare global {
  interface Window {
    tasymize: TasymizeApi
  }
}
