// ============================================================================
// A1 背词联动：词库匹配纯函数（独立可测，不碰 store / AI / IPC）
// 两个职责：
//   pickBoostWords —— 软引导选词：从在学的词里挑 ≤n 个最可能自然用上的，喂给 prompt
//   matchUsedWords —— 后验高亮：在 AI 产出的句子里找用户学过的词（词形容忍）
// 设计命门：绝不整库塞、绝不硬套——选词有上限，匹配只是事后高亮，句子质量永远第一。
// ============================================================================

/**
 * 词干归一化：小写 + 去常见派生后缀，让 accommodate/accommodating/accommodation 归到同一族。
 * 只用于"模糊命中"，不做语言学严格 stemming——够用且不引入依赖。
 * 规则（按长度从长到短试，避免过度剥离）：
 *   先去 -ation/-ition/-tion/-ing/-ers/-ies/-ed/-es/-er/-ly/-al/-s
 *   剥离后长度 <3 视为剥过头，放弃该次剥离（如 'as' 去 s 剩 'a' 无意义）。
 */
function stem(word: string): string {
  let w = word.toLowerCase().trim()
  // 短语取第一个实词（'give up' → 'give'），联动匹配以单词为单位足够
  w = w.split(/\s+/)[0] ?? w
  // 去尾标点（用户输入可能带 ? ! , .）
  w = w.replace(/[^a-z'-]+$/g, '')
  const suffixes = ['ation', 'ition', 'tion', 'ing', 'ies', 'ers', 'ed', 'es', 'er', 'ly', 'al', 's']
  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      const base = w.slice(0, -suf.length)
      // -ies → y 还原（studies→study）；-ation/-tion 常见 -e 结尾（accommodate）
      if (suf === 'ies') return base + 'y'
      return base
    }
  }
  return w
}

/** 判断文本里是否出现某词（词形容忍）：把文本按词边界切碎，逐词比对词干 */
function textContainsWord(text: string, word: string): boolean {
  const target = stem(word)
  if (target.length < 3) {
    // 太短的词（如 'a'/'is'）不做模糊匹配，退化为整词精确包含，避免满屏误命中
    return new RegExp(`\\b${escapeRe(word.toLowerCase().trim())}\\b`).test(text.toLowerCase())
  }
  const tokens = text.toLowerCase().split(/[^a-z'-]+/).filter(Boolean)
  return tokens.some((tok) => stem(tok) === target || stem(tok).startsWith(target) || target.startsWith(stem(tok)))
}

/** 正则特殊字符转义（短词精确匹配用） */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 软引导选词：从"在学/复习"的词里挑 ≤n 个最可能自然融入输入句的。
 * 优先级：
 *   1) 输入句已含其词干的词（用户正在用，最容易顺势优化）——排最前
 *   2) 其余按词表原顺序补齐到 n 个
 * 不整库塞：n 默认 8，给 AI 留"都不合适就忽略"的余地，避免硬套压迫感。
 * @param input 用户输入的句子
 * @param learningWords 候选词（调用方已筛 status 为 learning/review）
 * @param n 上限，默认 8
 */
export function pickBoostWords(input: string, learningWords: string[], n = 8): string[] {
  if (learningWords.length === 0) return []
  const inInput: string[] = []
  const rest: string[] = []
  for (const w of learningWords) {
    if (textContainsWord(input, w)) inInput.push(w)
    else rest.push(w)
  }
  return [...inInput, ...rest].slice(0, Math.max(0, n))
}

/**
 * 后验高亮匹配：返回 AI 产出文本中实际出现的、用户学过的词（去重，保持原词形）。
 * 用于 UI 高亮「✦ 学习中」——纯程序匹配，不依赖 AI 自报，AI 没采纳也只是不高亮。
 * @param text AI 产出的优化/翻译文本
 * @param words 用户词库候选（通常同 pickBoostWords 的来源集）
 */
export function matchUsedWords(text: string, words: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of words) {
    const key = w.toLowerCase().trim()
    if (seen.has(key)) continue
    if (textContainsWord(text, w)) {
      seen.add(key)
      out.push(w)
    }
  }
  return out
}
