#!/usr/bin/env node
// ============================================================================
// 离线词书批量生成脚本（计划 docs/superpowers/plans/2026-07-28-wordbook-gen-and-dup-guard.md 功能二）
//
// 用途：用 DeepSeek V4-Flash 离线生成 5 本内置预置词书（合计 ~4000 词，跨书零重复），
//   写入 data/wordbooks/<id>.json。独立 Node 脚本，不经 Electron、不 import src/ 任何模块
//   （避免拖入 electron-store/settings）。
//
// 运行：node scripts/gen-wordbook.mjs [--book <id>] [--only-wordlist] [--reset] [--help]
// 前置：设置环境变量 DEEPSEEK_API_KEY（key 只从环境变量读，绝不打印、不写入任何文件）。
//
// ⚠️ 运行前必做：先删除占位词书 data/wordbooks/ielts-sample.json！
//   阶段2 启动会扫描 data/wordbooks/ 全部 .json 进全局去重 Set，占位的 5 个词
//   （significant/controversial/inevitable/fundamental/phenomenon，全是高频词）会把正式词书
//   里的同词永久拦下。删了占位再跑；若已生成完才删，重跑一次本脚本即可补缺。
//
// 断点文件（scripts/.wordlist.json / scripts/.progress.json，已被 scripts/.gitignore 忽略）：
//   - .wordlist.json：阶段1产物——全局去重后的单词分配 {bookId: [words]}。存在则跳过阶段1。
//   - .progress.json：阶段2进度——每本已完成词数/失败批次记录。
//   阶段2 的"已完成"以词书文件本身为准（文件里已有的词跳过），progress 只做统计与失败报告。
//   --reset 删除这两个文件从头再来（不会删已生成的词书文件）。
// ============================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BOOKS_DIR = join(ROOT, 'data', 'wordbooks')
const WORDLIST_FILE = join(ROOT, 'scripts', '.wordlist.json') // 断点：阶段1产物
const PROGRESS_FILE = join(ROOT, 'scripts', '.progress.json') // 断点：阶段2进度

// —— DeepSeek 配置（照抄 src/main/ai.ts 的常量；key 只走环境变量）——
const BASE_URL = 'https://api.deepseek.com'
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash' // 可用环境变量覆盖模型
const API_KEY = process.env.DEEPSEEK_API_KEY || '' // 绝不打印、不落盘

// —— 批次与重试参数 ——
const WORDLIST_BATCH = 80 // 阶段1 每批生成候选词数
const CONTENT_BATCH = 15 // 阶段2 每批配内容的词数
const OVERGEN_RATIO = 1.2 // 阶段1 过量生成比例（预留去重损耗）
const MAX_TOPUP_ROUNDS = 2 // 阶段1 去重后不足时的补生成轮数上限
const MAX_CONSECUTIVE_FAILS = 3 // 阶段2 连续失败批次数上限，达到则中止

// —— 五本词书定义：难度隐含递进（词量递减、topicHint 逐级走高），desc 口语化、不明写分层 ——
const BOOKS = [
  {
    id: 'ielts-essential',
    name: '真题高频',
    count: 1200,
    topicHint: '雅思听读写最常考核心词',
    desc: '剑桥真题里反复出现的那批词，听说读写四科通吃。量最大但也最值，想提分先从这本啃起。',
  },
  {
    id: 'ielts-listening-speaking',
    name: '听说场景',
    count: 800,
    topicHint: '生活/校园/租房/求职等听说高频场景词',
    desc: '租房、选课、兼职、旅游……听力对话和口语聊天里天天见的场景词。先混个耳熟，听懂说顺不难。',
  },
  {
    id: 'ielts-academic-rw',
    name: '读写学术',
    count: 800,
    topicHint: '学术读写通用词(AWL类)',
    desc: '学术文章和写作 Task 2 里的通用学术词（AWL 那一挂）。阅读提速、写作告别小学生表达都靠它。',
  },
  {
    id: 'ielts-paraphrase',
    name: '同义替换',
    count: 700,
    topicHint: '阅读定位/口语写作换表达的高阶替换词',
    desc: '阅读定位全靠同义替换，口语写作同一个意思换个说法才不显重复。这本专收"换个高级说法"的词。',
  },
  {
    id: 'ielts-advanced',
    name: '高分进阶',
    count: 500,
    topicHint: '7+冲分用学术/抽象低频词',
    desc: '冲着 7+ 去的补充弹药：偏学术、偏抽象的低频词。建议前面几本啃得差不多了再来碰它。',
  },
]

// 阶段2 topic 字段的候选话题（与 prompt 保持一致，AI 返回值不在列时兜底「其他」）
const TOPICS = ['教育', '科技', '环境', '社会', '政府', '健康', '经济', '工作', '媒体', '其他']

// 粗略 token 估算（中英文混合按 4 字符≈1 token），只用于进度展示，不做计费依据
let estTokens = 0
const estimateTokens = (s) => Math.ceil(String(s).length / 4)

// ============================================================================
// DeepSeek 调用（照抄 src/main/ai.ts 的 callDeepseek fetch 逻辑）
// ============================================================================
async function callDeepseek(system, user, maxTokens) {
  if (!API_KEY) {
    throw new Error('未设置 DEEPSEEK_API_KEY 环境变量——请先设置后重试（key 只走环境变量，不写进任何文件）')
  }
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: user })

  // 90s 超时：flash 一般很快，但网络抖动/排队时不能无限挂起
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)
  let res
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature: 0.7, stream: false }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('请求超时（>90s）——稍后重试或检查网络')
    throw new Error(`网络请求失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // 401=key 错, 402=余额不足, 429=限流, 5xx=服务端 —— 带 status 方便定位
    throw new Error(`DeepSeek 请求失败 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`DeepSeek 返回格式异常：${data.error?.message ?? 'content 为空'}`)
  }
  estTokens += estimateTokens(system + user) + estimateTokens(content)
  return content
}

// ============================================================================
// 容错 JSON 解析（思路同 src/main/ai.ts 的 extractJsonBlock/parseVocabArray）
// ============================================================================

// strip ```json 围栏 + 定位首尾括号切出 JSON 片段
function extractJsonArray(text) {
  let body = text.trim()
  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) body = fence[1].trim()
  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) throw new Error('AI 返回中未找到 JSON 数组')
  return body.slice(start, end + 1)
}

function parseJsonArray(text) {
  const json = extractJsonArray(text)
  let arr
  try {
    arr = JSON.parse(json)
  } catch (err) {
    throw new Error(`AI 返回的 JSON 解析失败：${err instanceof Error ? err.message : String(err)}`)
  }
  if (!Array.isArray(arr)) throw new Error('AI 返回的不是 JSON 数组')
  return arr
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
// word 归一化：全项目检重统一 trim().toLowerCase()（见计划"关键探索事实"）
const normalize = (w) => String(w).trim().toLowerCase()

// 阶段1：解析纯单词数组（字符串数组），过滤非字符串项
function parseWordArray(text) {
  return parseJsonArray(text).filter(isNonEmptyString).map(normalize)
}

// 阶段2：解析 [{word,meaning,example,topic}]，校验 word/meaning/example 非空；topic 缺失/非法兜底「其他」
function parseContentArray(text) {
  const arr = parseJsonArray(text)
  const out = []
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i]
    if (!o || typeof o !== 'object' || Array.isArray(o)) {
      console.log(`  [跳过] 第 ${i + 1} 项不是对象`)
      continue
    }
    const { word, meaning, example, topic } = o
    if (!isNonEmptyString(word) || !isNonEmptyString(meaning) || !isNonEmptyString(example)) {
      console.log(`  [跳过] 第 ${i + 1} 项字段不全或为空（word/meaning/example 均需非空）`)
      continue
    }
    out.push({
      word: normalize(word),
      meaning: meaning.trim(),
      example: example.trim(),
      topic: TOPICS.includes(topic) ? topic : '其他',
    })
  }
  return out
}

// ============================================================================
// 断点文件读写（UTF-8、2 空格缩进，与现有词书格式一致）
// ============================================================================
const readJson = (file) => JSON.parse(readFileSync(file, 'utf-8'))
const writeJson = (file, obj) => writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf-8')

function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return { books: {} }
  try {
    return readJson(PROGRESS_FILE)
  } catch {
    console.log('[警告] .progress.json 损坏，按无进度处理')
    return { books: {} }
  }
}
function saveProgress(p) {
  p.updatedAt = new Date().toISOString()
  writeJson(PROGRESS_FILE, p)
}

// 扫描 data/wordbooks/ 现有全部词书的词（归一化），阶段2 去重兜底用
function collectExistingWords() {
  const set = new Set()
  if (!existsSync(BOOKS_DIR)) return set
  for (const f of readdirSync(BOOKS_DIR).filter((f) => f.endsWith('.json'))) {
    try {
      const book = readJson(join(BOOKS_DIR, f))
      for (const w of book.words || []) set.add(normalize(w.word))
    } catch {
      console.log(`[警告] ${f} 读取失败，扫词跳过`)
    }
  }
  return set
}

// ============================================================================
// 阶段1：生成全局去重词表 → scripts/.wordlist.json（{bookId: [words]}）
// 核心约束：AI 自由想词会跨书重复——统一进全局 Set，跨本不重复，结构上保证零撞词。
// ============================================================================
const WORDLIST_SYSTEM = `你是雅思词汇专家，帮备考雅思（目标 7+）的中国大学生挑选词汇。
要求：
- 只返回英文单词（或常见词组），小写，每批内部不重复
- 雅思向：考试真实高频/有用的词，避免太基础的（如 good/big/happy）
- 严格返回 JSON 数组（纯字符串数组），不要任何额外文字、不要 markdown 代码块`

async function genWordlist(book, assigned) {
  // 过量生成：目标 count 的 1.2 倍，预留全局去重损耗
  const need = Math.ceil(book.count * OVERGEN_RATIO)
  const batches = Math.ceil(need / WORDLIST_BATCH)
  const pool = new Set() // 本内部候选去重
  for (let b = 0; b < batches; b++) {
    const n = Math.min(WORDLIST_BATCH, need - b * WORDLIST_BATCH)
    console.log(`  批次 ${b + 1}/${batches}：生成 ${n} 个候选词…`)
    const text = await callDeepseek(
      WORDLIST_SYSTEM,
      `生成 ${n} 个候选词，方向：${book.topicHint}。`,
      4000,
    )
    for (const w of parseWordArray(text)) pool.add(w)
  }

  // 全局分配：跳过已被前面词书占用的词（跨本零重复的关键）
  const words = []
  for (const w of pool) {
    if (words.length >= book.count) break
    if (assigned.has(w)) continue
    assigned.add(w)
    words.push(w)
  }

  // 去重损耗超预期 → 补生成（最多 MAX_TOPUP_ROUNDS 轮）
  for (let round = 1; words.length < book.count && round <= MAX_TOPUP_ROUNDS; round++) {
    const shortBy = book.count - words.length
    console.log(`  [补生成] 去重后差 ${shortBy} 个，第 ${round} 轮补 ${shortBy + 10} 个候选…`)
    const text = await callDeepseek(
      WORDLIST_SYSTEM,
      `再生成 ${shortBy + 10} 个候选词，方向：${book.topicHint}。不要与常见雅思词表重复。`,
      4000,
    )
    for (const w of parseWordArray(text)) {
      if (words.length >= book.count) break
      if (pool.has(w) || assigned.has(w)) continue
      pool.add(w)
      assigned.add(w)
      words.push(w)
    }
  }
  if (words.length < book.count) {
    console.log(`  [警告] 补生成后仍只有 ${words.length}/${book.count} 个，按实际数量落盘`)
  }
  return words
}

async function stage1(targetBooks) {
  console.log('=== 阶段1：生成全局去重词表 ===')
  // 断点 + 合并：已存在则只补生成目标里缺的书（--book 部分跑后再全跑不会卡住）
  const wordlist = existsSync(WORDLIST_FILE) ? readJson(WORDLIST_FILE) : {}
  const missing = targetBooks.filter((b) => !Array.isArray(wordlist[b.id]) || !wordlist[b.id].length)
  if (!missing.length) {
    console.log('[断点] .wordlist.json 已覆盖全部目标词书，跳过阶段1（--reset 可重来）')
    return wordlist
  }
  if (Object.keys(wordlist).length) {
    console.log(`[断点] 已有 ${Object.keys(wordlist).length} 本词表，补生成：${missing.map((b) => b.id).join('、')}`)
  }
  const assigned = new Set() // 全局已分配词（归一化）；先装入已有词表，保证跨本零重复
  for (const words of Object.values(wordlist)) for (const w of words) assigned.add(normalize(w))
  for (const book of missing) {
    console.log(`[${book.id}] ${book.name} 目标 ${book.count} 词…`)
    wordlist[book.id] = await genWordlist(book, assigned)
    console.log(`[${book.id}] 分得 ${wordlist[book.id].length} 词（全局已分配 ${assigned.size}，估 ${estTokens} token）`)
  }
  writeJson(WORDLIST_FILE, wordlist)
  console.log(`阶段1完成 → ${WORDLIST_FILE}（全局 ${assigned.size} 词，估 ${estTokens} token）`)
  return wordlist
}

// ============================================================================
// 阶段2：逐词配内容（meaning 带词性 / example 雅思风格整句 / topic 话题）
// 每批成功即更新 data/wordbooks/<id>.json + .progress.json；重跑跳过文件里已有的词。
// ============================================================================
const CONTENT_SYSTEM = `你是雅思词汇专家，为给定单词生成学习内容。
对每个词返回：
- word：原样返回该词（小写）
- meaning：简明中文释义，开头标注词性缩写（n. / v. / adj. / adv. / phr.），格式「词性 释义」，例如「v. 放弃；抛弃」
- example：地道英文整句，雅思考试风格，体现该词用法
- topic：该词所属话题，从以下选一个：${TOPICS.join(' / ')}
严格返回 JSON 数组，每个元素 {"word","meaning","example","topic"}，不要任何额外文字、不要 markdown 代码块。`

async function stage2Book(book, words, progress) {
  const file = join(BOOKS_DIR, `${book.id}.json`)
  // "已完成"以词书文件本身为准（progress 只做统计），断点续跑跳过已有词
  const entries = existsSync(file) ? readJson(file).words || [] : []
  const doneSet = new Set(entries.map((e) => normalize(e.word)))
  const remaining = words.filter((w) => !doneSet.has(normalize(w)))
  console.log(`[${book.id}] ${book.name}：共 ${words.length} 词，已完成 ${doneSet.size}，待生成 ${remaining.length}`)

  const bp = (progress.books[book.id] ||= { done: doneSet.size, failed: [] })
  let consecutiveFails = 0

  for (let i = 0; i < remaining.length; i += CONTENT_BATCH) {
    const batch = remaining.slice(i, i + CONTENT_BATCH)
    const batchNo = Math.floor(i / CONTENT_BATCH) + 1
    const totalBatches = Math.ceil(remaining.length / CONTENT_BATCH)
    console.log(`  批次 ${batchNo}/${totalBatches}（${batch.length} 词，累计 ${entries.length}）…`)

    let items
    try {
      const text = await callDeepseek(
        CONTENT_SYSTEM,
        `为以下 ${batch.length} 个词生成内容：${batch.join(', ')}`,
        4000,
      )
      items = parseContentArray(text)
      consecutiveFails = 0 // 成功即清零连续失败计数
    } catch (err) {
      consecutiveFails++
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  [失败] 批次 ${batchNo}：${msg}（连续失败 ${consecutiveFails}/${MAX_CONSECUTIVE_FAILS}）`)
      bp.failed.push({ words: batch, error: msg, at: new Date().toISOString() })
      saveProgress(progress)
      if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        throw new Error(`连续失败 ${MAX_CONSECUTIVE_FAILS} 批，中止。已完成的 ${entries.length} 词已落盘，修好后重跑可续。`)
      }
      continue // 单次失败记入 failed，继续下一批
    }

    // 逐词入库：按请求的 batch 对齐 AI 返回（漏词/多余词都容掉），并做全局去重兜底
    const byWord = new Map(items.map((it) => [normalize(it.word), it]))
    const missed = []
    for (const w of batch) {
      const key = normalize(w)
      const it = byWord.get(key)
      if (!it) {
        missed.push(w) // AI 没返回/返回字段不全 → 记入 failed，最后报告
        continue
      }
      // 去重兜底：防御阶段1 漏检或 AI 改词导致跨书撞车（doneSet 内的词本来就是自己的，不算撞）
      if (globalWordSet.has(key) && !doneSet.has(key)) {
        console.log(`  [撞词跳过] ${key} 已存在于其他词书`)
        missed.push(w)
        continue
      }
      entries.push(it)
      doneSet.add(key)
      globalWordSet.add(key)
    }
    if (missed.length) {
      console.log(`  [漏词] ${missed.length} 个未配上：${missed.join(', ')}`)
      bp.failed.push({ words: missed, error: 'AI 返回缺失/字段不全/撞词', at: new Date().toISOString() })
    }

    // 每批成功即落盘词书 + 更新进度（断点续跑）
    writeJson(file, { id: book.id, name: book.name, desc: book.desc, words: entries })
    bp.done = entries.length
    saveProgress(progress)
    console.log(`  → 已写入 ${file}（累计 ${entries.length}/${words.length}，估 ${estTokens} token）`)
  }

  if (entries.length < words.length) {
    console.log(`[${book.id}] 完成但有缺口：${entries.length}/${words.length}（失败详情见 .progress.json，重跑可补）`)
  } else {
    console.log(`[${book.id}] 完成：${entries.length} 词`)
  }
}

// 全局词 Set：阶段2 去重兜底用（启动时扫描现有词书）
let globalWordSet = new Set()

async function stage2(targetBooks, wordlist) {
  console.log('=== 阶段2：逐词配内容 ===')
  mkdirSync(BOOKS_DIR, { recursive: true })
  globalWordSet = collectExistingWords()
  const progress = loadProgress()
  for (const book of targetBooks) {
    const words = wordlist[book.id]
    if (!words || !words.length) {
      console.log(`[${book.id}] 跳过：.wordlist.json 中没有该书的词（--book 过滤或阶段1未覆盖）`)
      continue
    }
    await stage2Book(book, words, progress)
  }
  // 失败汇总报告
  const progress2 = loadProgress()
  for (const book of targetBooks) {
    const failed = progress2.books[book.id]?.failed || []
    if (failed.length) {
      const failWords = failed.reduce((n, f) => n + f.words.length, 0)
      console.log(`[报告] ${book.id}：${failed.length} 个失败批次、共 ${failWords} 词未配上（重跑本脚本可续补）`)
    }
  }
}

// ============================================================================
// CLI
// ============================================================================
const HELP = `用法：node scripts/gen-wordbook.mjs [选项]
  （无参数）        全跑：阶段1 生成词表 → 阶段2 逐词配内容（断点自动续跑）
  --book <id>      只跑某一本（可选：${BOOKS.map((b) => b.id).join(' / ')}）
  --only-wordlist  只跑阶段1（生成全局去重词表 .wordlist.json）
  --reset          清除断点文件（.wordlist.json / .progress.json）后从头再来；不删已生成的词书
  --help, -h       显示本帮助
前置：设置环境变量 DEEPSEEK_API_KEY；可用 DEEPSEEK_MODEL 覆盖模型（默认 ${MODEL}）。`

function parseArgs(argv) {
  const opts = { book: null, onlyWordlist: false, reset: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--book') opts.book = argv[++i] || null
    else if (a === '--only-wordlist') opts.onlyWordlist = true
    else if (a === '--reset') opts.reset = true
    else if (a === '--help' || a === '-h') opts.help = true
    else throw new Error(`未知参数：${a}（--help 查看用法）`)
  }
  return opts
}

async function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
  if (opts.help) {
    console.log(HELP)
    return
  }
  if (opts.book && !BOOKS.some((b) => b.id === opts.book)) {
    console.error(`未知词书 id：${opts.book}（可选：${BOOKS.map((b) => b.id).join(' / ')}）`)
    process.exit(1)
  }
  if (opts.reset) {
    for (const f of [WORDLIST_FILE, PROGRESS_FILE]) {
      if (existsSync(f)) {
        unlinkSync(f)
        console.log(`[reset] 已删除 ${f}`)
      }
    }
    console.log('[reset] 断点已清除（已生成的词书文件未动）')
  }

  const targetBooks = opts.book ? BOOKS.filter((b) => b.id === opts.book) : BOOKS
  console.log(`目标词书：${targetBooks.map((b) => `${b.id}(${b.count})`).join('、')}，模型 ${MODEL}`)

  // key 检查放在真正要调 AI 之前（--help/--reset/断点全部命中都不需要 key）
  const existingList = existsSync(WORDLIST_FILE) ? readJson(WORDLIST_FILE) : {}
  const needStage1 = targetBooks.some((b) => !Array.isArray(existingList[b.id]) || !existingList[b.id].length)
  if (!API_KEY && (needStage1 || !opts.onlyWordlist)) {
    console.error('错误：未设置 DEEPSEEK_API_KEY 环境变量。')
    console.error('  PowerShell：$env:DEEPSEEK_API_KEY = "sk-..."')
    console.error('  CMD：       set DEEPSEEK_API_KEY=sk-...')
    process.exit(1)
  }

  const wordlist = await stage1(targetBooks)
  if (opts.onlyWordlist) {
    console.log('--only-wordlist：阶段1完成，结束。')
    return
  }
  // --book 过滤时 wordlist 可能是全量的（断点文件含全部书），stage2 内部按 id 取
  await stage2(targetBooks, wordlist)
  console.log(`全部完成。估算总 token ≈ ${estTokens}（粗略值，仅供体感）`)
}

main().catch((err) => {
  console.error(`\n中止：${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
