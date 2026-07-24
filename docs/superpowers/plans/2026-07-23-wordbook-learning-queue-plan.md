# 词书 + 学习队列轮回机制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给背词引入"学习队列"三态生命周期（new/learning/review）+ 词书批量添词，把"一锅轮"升级为有节奏的间隔重复。

**Architecture:** 数据层 VocabItem 加 `status`/`book` 字段；SRS 拆成 learning 队列逻辑 + review 阶梯两套；scheduler 负责"到期挑选 + 毕业补位"；词书是预生成 JSON，加入即批量进 `new` 状态。前端加"词书"页 + 设置页"记忆节奏"区 + 恢复默认。

**Tech Stack:** Electron 40 + React 19 + TS + Tailwind v4 + electron-store + electron-vite + Vitest

## Global Constraints

- React 19：禁 `JSX.Element`，用 `import type { ReactElement } from 'react'`
- Tailwind v4 JIT：类名必须完整字面量，禁运行时拼接
- store 的 srsStates 键经 JSON 序列化是字符串，遍历时 `Number(key)`；建议以 vocab 数组为主遍历
- electron-store v11 纯 ESM，store.ts 导入已用 `.default ?? 自身` 互操作（勿动）
- 弹性数值默认值（与设计文档一致）：learning_cap=10, pass_count=3, forgot_gap_min=5, fuzzy_gap_min=20, learning_step_min='10,60', review_steps_day='1,3,7,15,30'
- 数值设置键读取一律带兜底（参考 `Math.max(1, Number(x) || default)`），防止空串/负数/NaN
- 每个任务结束跑 `node node_modules/typescript/bin/tsc --noEmit`、`node node_modules/vitest/vitest.mjs run`、`npm run build` 三绿才提交
- 工作目录可能被重置，Bash 命令前加 `cd /c/Users/kingdee/Desktop/Tasymize`

---

### 包1：数据模型——status/book 字段 + 设置默认值 + 迁移

**Files:**
- Modify: `src/main/vocab.ts`（VocabItem 加字段）
- Modify: `src/shared/ipc-types.ts`（VocabItem 同步）
- Modify: `src/main/settings.ts`（新增弹性数值默认值）
- Modify: `src/main/store.ts`（迁移函数）
- Modify: `src/main/seed.ts`（种子词给 status）
- Test: `tests/vocab.test.ts`、`tests/settings.test.ts`

**Interfaces:**
- Produces: `VocabItem { ...; book: string|null; status: 'new'|'learning'|'review' }`；`NewVocabItem = Omit<VocabItem,'id'|'created_at'>`（含新字段）
- Produces: 设置键 `learning_cap/forgot_gap_min/fuzzy_gap_min/learning_step_min/review_steps_day`
- Produces: `migrateVocabStatus(): void`（store.ts，启动时给旧词补 status）

- [ ] **Step 1: 写失败测试**

`tests/vocab.test.ts` 追加：

```ts
import { addVocab, listVocab } from '../src/main/vocab'
import { _resetStoreForTests } from '../src/main/store'
import { describe, it, expect, beforeEach } from 'vitest'

describe('vocab status/book', () => {
  beforeEach(() => _resetStoreForTests())

  it('addVocab 默认 status=new、book 可空', () => {
    const v = addVocab({ word: 'a', meaning: 'b', example: 'c', topic: 't', book: null, status: 'new', source: 's' })
    expect(v.status).toBe('new')
    expect(v.book).toBeNull()
  })

  it('可指定 status 与 book', () => {
    addVocab({ word: 'a', meaning: 'b', example: 'c', topic: 't', book: 'core', status: 'learning', source: 's' })
    expect(listVocab()[0].book).toBe('core')
    expect(listVocab()[0].status).toBe('learning')
  })
})
```

`tests/settings.test.ts` 追加：

```ts
it('弹性数值默认值齐全', () => {
  expect(DEFAULT_SETTINGS.learning_cap).toBe('10')
  expect(DEFAULT_SETTINGS.forgot_gap_min).toBe('5')
  expect(DEFAULT_SETTINGS.fuzzy_gap_min).toBe('20')
  expect(DEFAULT_SETTINGS.learning_step_min).toBe('10,60')
  expect(DEFAULT_SETTINGS.review_steps_day).toBe('1,3,7,15,30')
})
```

- [ ] **Step 2: 跑测试确认失败**

`node node_modules/vitest/vitest.mjs run tests/vocab.test.ts tests/settings.test.ts` 预期 FAIL（VocabItem 无 status/book、设置无新键）

- [ ] **Step 3: 实现**

`src/main/vocab.ts` VocabItem 改为：

```ts
export interface VocabItem {
  id: number; word: string; meaning: string; example: string
  topic: string | null
  book: string | null                 // 来源词书 id，手动/种子词为 null
  status: 'new' | 'learning' | 'review' // 生命周期三态
  source: string; created_at: number
}
```

`src/shared/ipc-types.ts` 的 VocabItem 同步加上这两个字段。

`src/main/settings.ts` DEFAULT_SETTINGS 追加：

```ts
  learning_cap: '10',
  forgot_gap_min: '5',
  fuzzy_gap_min: '20',
  learning_step_min: '10,60',
  review_steps_day: '1,3,7,15,30',
```

`src/main/seed.ts`：种子词 addVocab 时补 `book: null, status: 'learning'`（现有 50 词保持继续背）。

`src/main/store.ts` 加迁移函数：

```ts
// 旧数据迁移：无 status 字段的词补上（默认 learning，保持 V1.1 行为）；无 book 补 null
export function migrateVocabStatus(): void {
  const list = vocabBox.get()
  let dirty = false
  const next = list.map((v) => {
    const anyV = v as Partial<import('./vocab').VocabItem>
    if (anyV.status && 'book' in anyV) return v
    dirty = true
    return { ...v, book: anyV.book ?? null, status: anyV.status ?? 'learning' }
  })
  if (dirty) vocabBox.set(next)
}
```

- [ ] **Step 4: 跑测试确认通过 + 三绿**

`node node_modules/vitest/vitest.mjs run` 全绿；`tsc --noEmit` 干净；`npm run build` 过。

- [ ] **Step 5: 接入迁移 + Commit**

`src/main/index.ts` 在 `seedIfEmpty()` 前调 `migrateVocabStatus()`。

```bash
git add -A && git commit -m "feat: VocabItem加status/book字段+弹性数值默认值+旧数据迁移"
```

---

### 包2：SRS 拆分——learning 队列逻辑 + review 阶梯

**Files:**
- Modify: `src/main/srs.ts`
- Test: `tests/srs.test.ts`

**Interfaces:**
- Consumes: 设置键（包1）
- Produces: `reviewLearning(state, grade, opts)`、`reviewReview(state, grade, opts)`；`SrsState` 不变
- Produces: opts 类型 `{ passN, forgotMin, fuzzyMin, learningSteps: number[], reviewSteps: number[] }`

- [ ] **Step 1: 写失败测试**

`tests/srs.test.ts` 重写核心用例：

```ts
import { describe, it, expect } from 'vitest'
import { defaultState, reviewLearning, reviewReview } from '../src/main/srs'

const OPTS = { passN: 3, forgotMin: 5, fuzzyMin: 20, learningSteps: [10, 60], reviewSteps: [1, 3, 7, 15, 30] }

describe('learning 队列', () => {
  it('忘了→清零+5分钟', () => {
    const s = reviewLearning({ easiness: 2.5, interval: 60, repetitions: 2 }, 0, OPTS)
    expect(s.repetitions).toBe(0); expect(s.interval).toBe(5)
  })
  it('模糊→清零+20分钟', () => {
    const s = reviewLearning(defaultState(), 1, OPTS)
    expect(s.repetitions).toBe(0); expect(s.interval).toBe(20)
  })
  it('认识递进10→60，满3次毕业(进首个review间隔1天)', () => {
    let s = defaultState()
    s = reviewLearning(s, 2, OPTS); expect(s.interval).toBe(10)          // 第1次
    s = reviewLearning(s, 2, OPTS); expect(s.interval).toBe(60)          // 第2次
    s = reviewLearning(s, 2, OPTS); expect(s.interval).toBe(1440)        // 毕业→1天
  })
})

describe('review 阶梯', () => {
  it('认识→按阶梯推进 1→3→7天', () => {
    let s = { easiness: 2.5, interval: 1440, repetitions: 0 }
    s = reviewReview(s, 2, OPTS); expect(s.interval).toBe(3 * 1440)
    s = reviewReview(s, 2, OPTS); expect(s.interval).toBe(7 * 1440)
  })
  it('模糊→间隔×1.2保持review', () => {
    const s = reviewReview({ easiness: 2.5, interval: 1440, repetitions: 0 }, 1, OPTS)
    expect(s.interval).toBeCloseTo(1440 * 1.2)
  })
  it('封顶30天', () => {
    let s = { easiness: 2.5, interval: 21600, repetitions: 0 }
    s = reviewReview(s, 2, OPTS); expect(s.interval).toBe(30 * 1440)
    s = reviewReview(s, 2, OPTS); expect(s.interval).toBe(30 * 1440) // 不超
  })
})
```

- [ ] **Step 2: 跑确认失败**（reviewLearning/reviewReview 不存在）

- [ ] **Step 3: 实现 srs.ts**

```ts
export type Grade = 0 | 1 | 2
export interface SrsState { easiness: number; interval: number; repetitions: number }
export function defaultState(): SrsState { return { easiness: 2.5, interval: 0, repetitions: 0 } }

export interface ReviewOpts {
  passN: number
  forgotMin: number
  fuzzyMin: number
  learningSteps: number[]  // learning 内"认识"递进（分钟）
  reviewSteps: number[]    // review 阶梯（天）
}

const MIN_EASINESS = 1.3

// learning 队列评分：连续答对 passN 次毕业（interval 返回首个 review 间隔=reviewSteps[0]天，单位分钟）
export function reviewLearning(state: SrsState, grade: Grade, o: ReviewOpts): SrsState {
  let { easiness, interval, repetitions } = state
  if (grade === 0) { repetitions = 0; interval = o.forgotMin; easiness = Math.max(MIN_EASINESS, easiness - 0.2) }
  else if (grade === 1) { repetitions = 0; interval = o.fuzzyMin; easiness = Math.max(MIN_EASINESS, easiness - 0.05) }
  else {
    repetitions += 1
    if (repetitions >= o.passN) interval = o.reviewSteps[0] * 1440 // 毕业：首个 review 间隔
    else interval = o.learningSteps[Math.min(repetitions - 1, o.learningSteps.length - 1)]
    easiness = Math.min(3.0, easiness + 0.05)
  }
  return { easiness, interval, repetitions }
}

// review 评分：认识→阶梯推进；模糊→×1.2；忘了由调用方负责打回 learning（此处不处理 grade0 的 status 变更）
export function reviewReview(state: SrsState, grade: Grade, o: ReviewOpts): SrsState {
  let { easiness, interval, repetitions } = state
  if (grade === 1) { interval = Math.round(interval * 1.2); easiness = Math.max(MIN_EASINESS, easiness - 0.05) }
  else if (grade === 2) {
    repetitions += 1
    const daySteps = o.reviewSteps
    const curDay = interval / 1440
    const nextDay = daySteps.find((d) => d > curDay) ?? daySteps[daySteps.length - 1]
    interval = nextDay * 1440
    easiness = Math.min(3.0, easiness + 0.05)
  }
  // grade 0 在 review 由 scheduler 打回 learning，这里不预期收到；保底按忘了处理
  else { repetitions = 0; interval = o.forgotMin; easiness = Math.max(MIN_EASINESS, easiness - 0.2) }
  return { easiness, interval, repetitions }
}
```

- [ ] **Step 4: 跑确认通过 + 三绿**（注意旧 review() 被删，scheduler 会暂断——包3 修；本包先只保证 srs.test 绿 + tsc 引用了新函数的文件待包3）

> 注：本包与包3 强耦合（scheduler 要改用新函数），可合并为一个任务交付，避免中间态 tsc 报错。

- [ ] **Step 5: Commit**（与包3 合并提交）

---

### 包3：scheduler——到期挑选 + 毕业补位 + 评分路由

**Files:**
- Modify: `src/main/scheduler.ts`
- Test: `tests/scheduler.test.ts`

**Interfaces:**
- Consumes: `reviewLearning/reviewReview`（包2）、`VocabItem.status`（包1）、设置键
- Produces: `getDueVocab(now)`（只挑 learning/review 到期）、`applyReview(id, grade, now)`（按 status 路由 + 毕业改 status + 补位）
- Produces: `fillLearningQueue(now): void`（补位：learning 不满则从新词补到 learning_cap）

- [ ] **Step 1: 写失败测试**

`tests/scheduler.test.ts` 用例：

```ts
// 辅助：造一个指定 status 的词（addVocab 后手动改 status）
import { addVocab, listVocab, updateVocab } from '../src/main/vocab'
import { getDueVocab, applyReview, fillLearningQueue } from '../src/main/scheduler'
import { getSrsState, setSrsState, _resetStoreForTests } from '../src/main/store'
import { setSetting } from '../src/main/settings'

// new 状态的词不会被 getDueVocab 选中
// learning 的词连续答对 pass_count 次后 status 变 review，due_at 约 1 天后
// learning 毕业空位后 fillLearningQueue 从 new 补一个词进 learning
// review 的词点忘了 → status 打回 learning、due_at 约 5 分钟后
```

（实现者需补全具体断言，沿用现有 scheduler.test 的造词模式：addVocab + setSrsState 控制 due_at）

- [ ] **Step 2: 跑确认失败**

- [ ] **Step 3: 实现 scheduler.ts**

关键逻辑：

```ts
function num(key: string, def: number): number { return Math.max(0, Number(getSetting(key)) || def) }
function listSetting(key: string, def: number[]): number[] {
  const raw = getSetting(key)
  if (!raw) return def
  const arr = raw.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n) && n > 0)
  return arr.length ? arr : def
}
function opts(): ReviewOpts {
  return {
    passN: Math.max(1, num('pass_count', 3)),
    forgotMin: Math.max(1, num('forgot_gap_min', 5)),
    fuzzyMin: Math.max(1, num('fuzzy_gap_min', 20)),
    learningSteps: listSetting('learning_step_min', [10, 60]),
    reviewSteps: listSetting('review_steps_day', [1, 3, 7, 15, 30]),
  }
}

// 到期挑选：只看 learning / review，且 due_at <= now，取最早
export function getDueVocab(now: number): VocabItem | null {
  let best: VocabItem | null = null; let bestDue = Infinity
  for (const e of listVocab()) {
    if (e.status === 'new') continue
    const s = getSrsState(e.id); if (!s) continue
    if (s.due_at <= now && s.due_at < bestDue) { best = e; bestDue = s.due_at }
  }
  return best
}

// 评分路由 + 毕业 + 打回
export function applyReview(id: number, grade: Grade, now: number): void {
  const item = listVocab().find((v) => v.id === id); if (!item) return
  const cur = getSrsState(id)
  const base: SrsState = cur ? { easiness: cur.easiness, interval: cur.interval, repetitions: cur.repetitions } : defaultState()
  const o = opts()
  let next: SrsState
  let newStatus = item.status
  if (item.status === 'review') {
    if (grade === 0) { // 复习忘了→打回 learning
      next = reviewLearning({ ...base, repetitions: 0 }, 0, o); newStatus = 'learning'
    } else {
      next = reviewReview(base, grade, o)
    }
  } else { // learning
    next = reviewLearning(base, grade, o)
    if (grade === 2 && next.repetitions >= o.passN) newStatus = 'review' // 毕业
  }
  setSrsState(id, { ...next, due_at: now + Math.round(next.interval * 60000), last_reviewed: now })
  if (newStatus !== item.status) updateVocab(id, { status: newStatus })
  if (newStatus === 'review') fillLearningQueue(now) // 毕业空位→补新词
}

// 补位：learning 不足 learning_cap 时，从 new 补（优先当前词书，其次手动）。新补的词 due_at=now（立即可弹）
export function fillLearningQueue(now: number): void {
  const cap = Math.max(1, num('learning_cap', 10))
  const all = listVocab()
  const learningCount = all.filter((v) => v.status === 'learning').length
  let need = cap - learningCount
  if (need <= 0) return
  const candidates = all.filter((v) => v.status === 'new').sort((a, b) => a.id - b.id)
  for (const c of candidates) {
    if (need <= 0) break
    updateVocab(c.id, { status: 'learning' })
    const s = getSrsState(c.id)
    setSrsState(c.id, { ...(s ?? { ...defaultState(), due_at: now, last_reviewed: null }), due_at: now })
    need--
  }
}
```

- [ ] **Step 4: 跑确认通过 + 三绿**

- [ ] **Step 5: 启动接入 + Commit**

`src/main/index.ts` 在 `startEngine` 前调一次 `fillLearningQueue(Date.now())`（启动即把队列补满）。

```bash
git add -A && git commit -m "feat: SRS拆分learning/review + scheduler到期挑选/毕业补位/评分路由"
```

---

### 包4：词书数据 + 后端（自编词表 + 加入/移除）

**Files:**
- Create: `data/wordbooks/ielts-core.json`、`data/wordbooks/ielts-academic.json`（2 本预生成词表）
- Create: `src/main/wordbook.ts`
- Modify: `src/main/ipc.ts`（词书 IPC）
- Test: `tests/wordbook.test.ts`

**Interfaces:**
- Consumes: `addVocab`（带 book/status 字段）
- Produces: `listWordbooks(): { id,name,count,desc }[]`、`addWordbookToPlan(bookId): number`、`removeWordbookFromPlan(bookId): number`

- [ ] **Step 1: 写失败测试**

```ts
// listWordbooks 返回 2 本且词数>0
// addWordbookToPlan('ielts-core') 把该书词以 status=new、book='ielts-core' 入库，返回条数
// 重复加入同书 → 返回 0（已加入的不重复）
// removeWordbookFromPlan 只删该书 status=new 的词，learning/review 中的保留
```

- [ ] **Step 2: 跑确认失败**

- [ ] **Step 3: 编词表 + 实现 wordbook.ts**

词表 JSON 结构：`{ "id","name","desc","words":[{word,meaning,example,topic}] }`。**由协调者（我）用 AI 知识自编 2 本各 ~80 词**（雅思核心高频 + 学术写作），质量把关后落盘——这一步由协调者完成，不派子代理。

`wordbook.ts`：

```ts
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { addVocab, listVocab, deleteVocab } from './vocab'

export interface WordbookMeta { id: string; name: string; count: number; desc: string }
interface WordbookFile { id: string; name: string; desc: string; words: { word: string; meaning: string; example: string; topic: string }[] }

function readBook(file: string): WordbookFile {
  return JSON.parse(readFileSync(join(process.cwd(), 'data', 'wordbooks', file), 'utf-8')) as WordbookFile
}
function allBooks(): WordbookFile[] {
  const dir = join(process.cwd(), 'data', 'wordbooks')
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map(readBook)
}

export function listWordbooks(): WordbookMeta[] {
  return allBooks().map((b) => ({ id: b.id, name: b.name, count: b.words.length, desc: b.desc }))
}

export function addWordbookToPlan(bookId: string): number {
  const book = allBooks().find((b) => b.id === bookId); if (!book) return 0
  if (listVocab().some((v) => v.book === bookId)) return 0 // 已加入过
  for (const w of book.words) addVocab({ ...w, book: bookId, status: 'new', source: '词书' })
  return book.words.length
}

// 只删该书仍处 new 的词；learning/review 中的保留（用户已在学）
export function removeWordbookFromPlan(bookId: string): number {
  const toDelete = listVocab().filter((v) => v.book === bookId && v.status === 'new')
  for (const v of toDelete) deleteVocab(v.id)
  return toDelete.length
}
```

IPC：`'wordbook:list'` / `'wordbook:add'` / `'wordbook:remove'`，preload + ipc-types 三处对齐。

- [ ] **Step 4: 跑确认通过 + 三绿**

- [ ] **Step 5: Commit** `feat: 词书后端——自编词表+加入/移除学习计划`

---

### 包5：前端——词书页 + 生词库 status 显示

**Files:**
- Create: `src/renderer/manager/views/WordbooksView.tsx`
- Modify: `src/renderer/manager/App.tsx`（加"词书"标签）
- Modify: `src/renderer/manager/views/ExpressionsView.tsx`（列表显示 status）
- Modify: `src/preload/index.ts`、`src/shared/ipc-types.ts`（若包4 未做全）

**Interfaces:**
- Consumes: `window.tasymize.listWordbooks/addWordbook/removeWordbook`

- [ ] **Step 1: WordbooksView**

卡片列表：每本词书一张卡（名称/词数/简介/"加入学习计划"或"已加入·移除"按钮）。点加入→调 IPC→刷新状态。配色走 theme（亮色系卡片：`rounded-2xl border border-black/10 bg-white/60 p-5`）。

- [ ] **Step 2: App.tsx 加第三个标签"词书"**

`tab` 类型扩 `'vocab'|'wordbooks'|'settings'`，nav 加按钮，main 渲染 WordbooksView。

- [ ] **Step 3: 生词库 status 显示**

ExpressionsView 每行加状态小标签：新词/学习中/复习中（不同浅色徽标，如 new=slate、learning=accent、review=emerald）。

- [ ] **Step 4: 三绿 + 真机自检**（词书加入→生词库出现该书 new 词→状态标签正确）

- [ ] **Step 5: Commit** `feat: 词书页+生词库status显示`

---

### 包6：设置页"记忆节奏"区 + 恢复默认 + 最终评审

**Files:**
- Modify: `src/renderer/manager/views/SettingsView.tsx`
- Modify: `src/main/ipc.ts`（resetSettings IPC，可选——也可前端逐个 set）
- Test: `tests/settings.test.ts`（恢复默认逻辑）

**Interfaces:**
- Consumes: 弹性数值设置键（包1）
- Produces: `resetSettings(): void`（弹性数值重置为 DEFAULT_SETTINGS）

- [ ] **Step 1: 设置页加"记忆节奏"分区**

数字输入：learning_cap、forgot_gap_min、fuzzy_gap_min、pass_count；文本输入（逗号分隔）：learning_step_min、review_steps_day。各带说明文字。

- [ ] **Step 2: 恢复默认按钮**

设置页顶部"恢复默认设置"按钮 + 二次确认（`confirm()` 或自定义小弹窗）。点击→弹性数值键全部 setSetting 回 DEFAULT_SETTINGS → 刷新本地 state。主进程加 `resetSettings()`：

```ts
const ELASTIC_KEYS = ['learning_cap','pass_count','forgot_gap_min','fuzzy_gap_min','learning_step_min','review_steps_day']
export function resetElasticSettings(): void {
  for (const k of ELASTIC_KEYS) setSetting(k, DEFAULT_SETTINGS[k])
}
```

- [ ] **Step 3: 三绿 + Commit** `feat: 设置页记忆节奏区+恢复默认`

- [ ] **Step 4: 最终 whole-branch 评审**（opus，跨包一致性 + 数值边界 + status 状态机推演）

---

## Self-Review 记录
- 包2 与包3 强耦合（scheduler 引用 srs 新函数），计划已注明可合并交付避免中间态 tsc 报错
- 词表内容由协调者自编（质量把关），不派子代理——这是内容任务非代码任务
- 数值兜底逻辑（num/listSetting）在包3 定义，包6 前端只做展示+调用
