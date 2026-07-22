import { readFileSync } from 'fs'
import { join } from 'path'
import { addVocab, listVocab } from './vocab'

interface SeedItem {
  word: string
  meaning: string
  example: string
  topic: string
}

export function seedIfEmpty(seedPath?: string): number {
  if (listVocab().length > 0) return 0
  const file = seedPath ?? join(process.cwd(), 'data', 'seed-vocab.json')
  const items = JSON.parse(readFileSync(file, 'utf-8')) as SeedItem[]
  for (const it of items) {
    // addVocab 内部会自增 id 并自动初始化该条的 SRS 状态
    addVocab({ ...it, source: '内置' })
  }
  return items.length
}
