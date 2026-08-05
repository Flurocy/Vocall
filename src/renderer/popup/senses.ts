import type { VocabItem, Sense } from '../../shared/ipc-types'

// 一词多义：弹窗背面要显示的义项挑选（纯函数，独立可测）。
// 规则：用户勾选了义项（selectedSenses 非空）且词带 senses → 返回勾选的义项（按勾选顺序）；
// 否则返回 null（调用方回退显示默认义项 meaning，旧词/未勾选/单义词与从前一致）。
// 防御：selectedSenses 下标越界（数据异常/词书翻新后义项变少）的过滤；过滤后为空也返回 null。
export function pickShownSenses(item: Pick<VocabItem, 'senses' | 'selectedSenses'>): Sense[] | null {
  if (!item.senses || item.senses.length === 0) return null
  if (!item.selectedSenses || item.selectedSenses.length === 0) return null
  const picked = item.selectedSenses
    .filter((i) => i >= 0 && i < item.senses!.length)
    .map((i) => item.senses![i])
  return picked.length > 0 ? picked : null
}
