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
  // 防御（评审 I-3）：种子文件缺失/JSON损坏/从非项目根启动时，readFileSync/JSON.parse
  // 会抛异常。此处必须吞掉返回 0——否则异常会顺着 whenReady 回调炸断后续
  // registerIpc/建窗/引擎/托盘的整条启动链，表现为"双击没反应"。
  let items: SeedItem[]
  try {
    items = JSON.parse(readFileSync(file, 'utf-8')) as SeedItem[]
  } catch (err) {
    console.warn('[seed] 种子数据导入失败，跳过：', err)
    return 0
  }
  let added = 0
  for (const it of items) {
    // addVocab 内部会自增 id 并自动初始化该条的 SRS 状态
    // 种子词保持继续背 → status:'learning'、book:null（addVocab 也有此默认，这里显式写出表意）
    // 逐条 try/catch（评审 C-1）：用户把生词全软删进回收站后重启——listVocab 空守卫放行，
    // 但 addVocab 查重含回收站会抛「在回收站」/「已在生词库」。重复词跳过不视为失败；其他错误上抛
    // （index.ts 调用处另有兜底 catch，不会炸断启动链）。
    try {
      addVocab({ ...it, book: null, status: 'learning', source: '内置' })
      added++
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      if (!/已在生词库|在回收站/.test(m)) throw err
    }
  }
  return added
}
