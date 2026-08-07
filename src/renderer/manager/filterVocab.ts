import type { VocabItem } from '../../shared/ipc-types'

// ============================================================================
// B2 生词库搜索/筛选：纯函数，独立可测，不碰 store / IPC。
// 设计（用户拍板）：word + meaning 都搜、简单子串匹配（不碰词形，避免误命中 bug）、
// 大小写不敏感、状态筛选可选（'all' 或四态之一）。
// ============================================================================

/** 状态筛选值：'all' = 不筛；其余对应 VocabItem.status 四态 */
export type StatusFilter = 'all' | VocabItem['status']

/** 是否处于"激活过滤"状态（有搜索词或筛了状态）——激活时列表平铺，不分段 */
export function isFiltering(query: string, status: StatusFilter): boolean {
  return query.trim().length > 0 || status !== 'all'
}

/**
 * 过滤生词列表。
 * - query 非空：word 或 meaning 含该子串（大小写不敏感）即命中
 * - status 非 'all'：只保留该状态的词
 * - 两者都空/全 → 原样返回（调用方维持现有分段渲染）
 * 返回新数组，不改原 list；保持原有顺序（调用方已按 id 排好）。
 */
export function filterVocab(
  list: VocabItem[],
  query: string,
  status: StatusFilter,
): VocabItem[] {
  const q = query.trim().toLowerCase()
  return list.filter((item) => {
    if (status !== 'all' && item.status !== status) return false
    if (q.length === 0) return true
    return (
      item.word.toLowerCase().includes(q) ||
      item.meaning.toLowerCase().includes(q)
    )
  })
}
