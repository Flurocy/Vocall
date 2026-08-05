import { describe, it, expect } from 'vitest'
import { pickShownSenses } from '../src/renderer/popup/senses'

// 弹窗背面义项挑选：勾选有效→按勾选显示；否则回退默认义项（旧词/单义词与从前一致）

const SENSES = [
  { pos: 'n.', meaning: '通道；入口' },
  { pos: 'n.', meaning: '使用权' },
  { pos: 'v.', meaning: '存取；访问' },
]

describe('pickShownSenses —— 弹窗义项挑选', () => {
  it('勾选了义项 → 按勾选返回（保勾选顺序）', () => {
    expect(pickShownSenses({ senses: SENSES, selectedSenses: [2, 0] })).toEqual([SENSES[2], SENSES[0]])
  })

  it('未勾选（undefined）→ null 回退默认义项', () => {
    expect(pickShownSenses({ senses: SENSES })).toBeNull()
    expect(pickShownSenses({ senses: SENSES, selectedSenses: [] })).toBeNull()
  })

  it('无 senses（旧词/单义词）→ null', () => {
    expect(pickShownSenses({})).toBeNull()
    expect(pickShownSenses({ selectedSenses: [0] })).toBeNull()
    expect(pickShownSenses({ senses: [], selectedSenses: [0] })).toBeNull()
  })

  it('下标越界过滤；全越界 → null 回退', () => {
    expect(pickShownSenses({ senses: SENSES, selectedSenses: [0, 99] })).toEqual([SENSES[0]])
    expect(pickShownSenses({ senses: SENSES, selectedSenses: [99, -1] })).toBeNull()
  })
})
