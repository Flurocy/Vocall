import { describe, it, expect } from 'vitest'
import { filterVocab, isFiltering } from '../src/renderer/manager/filterVocab'
import type { VocabItem } from '../src/shared/ipc-types'

// B2 搜索/筛选纯函数：word+meaning 子串匹配、大小写不敏感、状态可选筛选、不碰词形。

function word(partial: Partial<VocabItem> & { word: string }): VocabItem {
  return {
    id: 0, meaning: '', example: '', topic: null, book: null,
    status: 'new', source: '手动', created_at: 0, ...partial,
  }
}

const list: VocabItem[] = [
  word({ id: 1, word: 'abandon', meaning: 'v. 放弃；抛弃', status: 'learning' }),
  word({ id: 2, word: 'accommodate', meaning: 'v. 容纳；适应', status: 'review' }),
  word({ id: 3, word: 'Benefit', meaning: 'n. 好处；益处', status: 'mastered' }),
  word({ id: 4, word: 'curriculum', meaning: 'n. 课程体系', status: 'new' }),
]

describe('isFiltering —— 是否处于过滤态', () => {
  it('空 query + all：非过滤态（维持分段渲染）', () => {
    expect(isFiltering('', 'all')).toBe(false)
    expect(isFiltering('   ', 'all')).toBe(false) // 纯空白视为空
  })
  it('有 query 或筛了状态：过滤态（平铺）', () => {
    expect(isFiltering('a', 'all')).toBe(true)
    expect(isFiltering('', 'learning')).toBe(true)
    expect(isFiltering('a', 'new')).toBe(true)
  })
})

describe('filterVocab —— 搜索 + 筛选', () => {
  it('空 query + all：原样返回（顺序不变）', () => {
    const out = filterVocab(list, '', 'all')
    expect(out.map((w) => w.id)).toEqual([1, 2, 3, 4])
  })

  it('按 word 子串命中（英文）', () => {
    const out = filterVocab(list, 'accomm', 'all')
    expect(out.map((w) => w.word)).toEqual(['accommodate'])
  })

  it('按 meaning 子串命中（中文释义也搜）', () => {
    const out = filterVocab(list, '放弃', 'all')
    expect(out.map((w) => w.word)).toEqual(['abandon'])
  })

  it('大小写不敏感（query 小写命中大写词，反之亦然）', () => {
    expect(filterVocab(list, 'benefit', 'all').map((w) => w.word)).toEqual(['Benefit'])
    expect(filterVocab(list, 'BENEFIT', 'all').map((w) => w.word)).toEqual(['Benefit'])
  })

  it('简单子串，不做词形归一（accommodat 命中，但 accommodation 不会因 accommodate 命中之外的逻辑）', () => {
    // 子串 'accommodate' 命中 'accommodate' 本身；'accommodating' 若在库也命中（子串包含），但不做 stem
    expect(filterVocab(list, 'accommodate', 'all').map((w) => w.word)).toEqual(['accommodate'])
  })

  it('状态筛选：只看某状态', () => {
    expect(filterVocab(list, '', 'learning').map((w) => w.word)).toEqual(['abandon'])
    expect(filterVocab(list, '', 'new').map((w) => w.word)).toEqual(['curriculum'])
    expect(filterVocab(list, '', 'mastered').map((w) => w.word)).toEqual(['Benefit'])
  })

  it('搜索 + 状态组合：两者都满足才命中', () => {
    // 'a' 子串命中多个，但叠加 learning 只剩 abandon
    expect(filterVocab(list, 'a', 'learning').map((w) => w.word)).toEqual(['abandon'])
    // meaning 'n.' 命中两个，叠加 new 只剩 curriculum
    expect(filterVocab(list, 'n.', 'new').map((w) => w.word)).toEqual(['curriculum'])
  })

  it('无命中：空数组', () => {
    expect(filterVocab(list, 'zzzzz', 'all')).toEqual([])
    expect(filterVocab(list, 'a', 'mastered')).toEqual([]) // mastered 里没有含 a 的
  })

  it('不改原数组（纯函数）', () => {
    const before = list.length
    filterVocab(list, 'a', 'learning')
    expect(list.length).toBe(before)
  })
})
