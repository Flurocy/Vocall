import { readFileSync } from 'fs'
import { join } from 'path'
import { addExpression, listExpressions } from './expressions'

interface SeedItem {
  plain: string
  advanced: string
  example: string
  topic: string
}

export function seedIfEmpty(seedPath?: string): number {
  if (listExpressions().length > 0) return 0
  const file = seedPath ?? join(process.cwd(), 'data', 'seed-expressions.json')
  const items = JSON.parse(readFileSync(file, 'utf-8')) as SeedItem[]
  for (const it of items) {
    // addExpression 内部会自增 id 并自动初始化该条的 SRS 状态
    addExpression({ ...it, source: '内置' })
  }
  return items.length
}
