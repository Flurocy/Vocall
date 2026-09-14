// 反转回忆 包5：拼写对比纯函数（设计稿 v1.6.1 §3.4）。
// 逐字符位置对比用户输入 vs 目标词：忽略大小写 + trim，但不放宽编辑距离（拼错就是拼错）。
// 拼写仅作翻面参考反馈（绿/红渲染），评分权在用户，不打回。

export interface SpellChar {
  char: string // 用户输入的原样字符（保留大小写显示）
  ok: boolean  // 该位置是否与目标词一致（忽略大小写）
}

export interface SpellResult {
  correct: boolean // 整体判定：trim + 忽略大小写后完全相等
  chars: SpellChar[] // 逐字符标记（长度=用户输入 trim 后长度；超出目标的字符标 false）
}

export function compareSpelling(input: string, target: string): SpellResult {
  const typed = input.trim()
  const t = target.trim().toLowerCase()
  const lower = typed.toLowerCase()
  const chars: SpellChar[] = []
  for (let i = 0; i < typed.length; i++) {
    chars.push({ char: typed[i], ok: i < t.length && lower[i] === t[i] })
  }
  return { correct: lower === t, chars }
}
