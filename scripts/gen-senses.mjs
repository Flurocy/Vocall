#!/usr/bin/env node
// ============================================================================
// 词书一词多义翻新脚本（feat/polysemy 阶段2a）
//
// 用途：把 data/wordbooks/*.json 里所有词过一遍 DeepSeek，为每个词生成规范的
//   senses 多义项数组（[{pos, meaning}]，按常用度排序，最多 4 个），写回词书文件。
//   同时把 meaning 字段刷新为默认义项（=senses[0] 拼接），向后兼容旧展示。
//   独立 Node 脚本，不经 Electron、不 import src/ 任何模块。
//
// 运行：DEEPSEEK_API_KEY=sk-xxx node scripts/gen-senses.mjs [--book <id>] [--batch <n>]
// 前置：环境变量 DEEPSEEK_API_KEY（只从环境变量读，不打印、不落盘）。
//
// 断点续跑：词书文件本身即进度——已有 senses 的词跳过，中断后重跑只补缺口。
// 成本估算：1580 词 / 每批 20 = 约 80 次调用，flash + 关思考，输出约 120k token。
// 注意：生成后 App 启动迁移（migrateSensesFromWordbooks）会自动给已入库词书词补 senses。
// ============================================================================

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BOOKS_DIR = join(ROOT, 'data', 'wordbooks')

const BASE_URL = 'https://api.deepseek.com'
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'
const API_KEY = process.env.DEEPSEEK_API_KEY || '' // 绝不打印、不落盘

const BATCH = 20            // 每次调用处理的词数
const MAX_CONSECUTIVE_FAILS = 3
const RETRY_BACKOFF_MS = [2000, 5000, 10000] // 单批失败重试间隔

// —— CLI 参数 ——
const args = process.argv.slice(2)
function argValue(flag) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}
const ONLY_BOOK = argValue('--book')
const BATCH_SIZE = Number(argValue('--batch')) || BATCH

if (!API_KEY) {
  console.error('缺少环境变量 DEEPSEEK_API_KEY。用法：DEEPSEEK_API_KEY=sk-xxx node scripts/gen-senses.mjs')
  process.exit(1)
}

const SYSTEM = `你是英语词典编纂助手。给定一批英语单词/词组，为每个词给出规范的多义项释义。
要求：
1. 按常用度排序，最多 4 个义项；明显单义的词只给 1 个。
2. 每个义项 = 一个词性(pos) + 该词性下的简明中文释义(meaning)，pos 用标准缩写加句点（n./v./adj./adv./prep./conj./phr. 等）。
3. 同一词性下的近义中文用"；"并列，不要按词性拆成多条重复。
4. 面向雅思考生：优先考试常见义项，生僻义项不给。
5. 只输出 JSON 数组，不要任何额外文字：[{"word":"...","senses":[{"pos":"n.","meaning":"..."}]}]，顺序与输入一致。`

async function callDeepseek(words) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `单词列表：${JSON.stringify(words)}` },
      ],
      max_tokens: 4000,
      temperature: 0.3, // 词典任务求稳不求活
      stream: false,
      thinking: { type: 'disabled' }, // 省 token（简单结构化任务）
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ''
  // 容忍模型偶发包裹 ```json ... ```
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) throw new Error(`响应无 JSON 数组：${text.slice(0, 120)}`)
  return JSON.parse(m[0])
}

function validSenses(senses) {
  return Array.isArray(senses) && senses.length > 0 &&
    senses.every((s) => s && typeof s.pos === 'string' && typeof s.meaning === 'string' && s.pos && s.meaning)
}

async function processBook(file) {
  const path = join(BOOKS_DIR, file)
  const book = JSON.parse(readFileSync(path, 'utf-8'))
  const pending = book.words.filter((w) => !validSenses(w.senses))
  if (pending.length === 0) {
    console.log(`[${book.id}] 已全部翻新，跳过`)
    return
  }
  console.log(`[${book.id}] 待翻新 ${pending.length}/${book.words.length} 词`)
  let done = 0
  let consecutiveFails = 0
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)
    const words = batch.map((w) => w.word)
    let result = null
    for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
      try {
        result = await callDeepseek(words)
        break
      } catch (err) {
        if (attempt === RETRY_BACKOFF_MS.length) {
          console.error(`[${book.id}] 批次 ${i}-${i + batch.length} 重试耗尽：${err.message}`)
        } else {
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]))
        }
      }
    }
    if (!result) {
      consecutiveFails++
      if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        console.error(`[${book.id}] 连续 ${MAX_CONSECUTIVE_FAILS} 批失败，中止（已完成的已写盘，可重跑续上）`)
        return
      }
      continue
    }
    consecutiveFails = 0
    // 按 word 归一化匹配回写（模型返回顺序理论一致，但按词匹配更稳）
    const byWord = new Map(result.map((r) => [String(r.word ?? '').trim().toLowerCase(), r]))
    let filled = 0
    for (const w of batch) {
      const r = byWord.get(w.word.trim().toLowerCase())
      if (!r || !validSenses(r.senses)) continue
      w.senses = r.senses.slice(0, 4).map((s) => ({ pos: s.pos.trim(), meaning: s.meaning.trim() }))
      w.meaning = `${w.senses[0].pos} ${w.senses[0].meaning}` // 默认义项=第一义项
      filled++
    }
    done += filled
    writeFileSync(path, JSON.stringify(book, null, 2) + '\n', 'utf-8') // 每批即写盘=断点
    console.log(`[${book.id}] ${done}/${pending.length}（本批 ${filled}/${batch.length}）`)
    if (filled < batch.length) {
      const missed = batch.filter((w) => !validSenses(w.senses)).map((w) => w.word)
      console.warn(`  ⚠️ 本批 ${batch.length - filled} 词未回填：${missed.join(', ')}（重跑会再试）`)
    }
  }
}

const files = readdirSync(BOOKS_DIR).filter((f) => f.endsWith('.json'))
const targets = ONLY_BOOK ? files.filter((f) => f.startsWith(ONLY_BOOK)) : files
if (targets.length === 0) {
  console.error(`没有找到目标词书（--book ${ONLY_BOOK ?? '全部'}）`)
  process.exit(1)
}
console.log(`目标 ${targets.length} 本词书，模型 ${MODEL}，每批 ${BATCH_SIZE} 词`)
for (const f of targets) {
  await processBook(f)
}
console.log('全部完成。')
