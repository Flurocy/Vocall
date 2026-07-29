# 词书生成脚本：话题聚类 + 穷举式改造 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `scripts/gen-wordbook.mjs` 从"考试场景切分 + 凑数补生成"改造成"话题聚类 + 穷举式生成"，解决前三本词穷（429/154）问题，并让词按话题/词根聚类排列。

**Architecture:** 单文件 ESM 脚本（`scripts/gen-wordbook.mjs`）。改造三处核心：①`BOOKS` 定义改 5 本话题版（移除 `count`）；②`genWordlist` 从"目标值+补生成"重写为"穷举到自然枯竭"；③prompt 加"话题内聚类排列"。`callDeepseek`/容错解析/断点续跑/阶段2 全流程不动（已验证）。

**Tech Stack:** Node 18+ 原生（fetch/fs/path），纯 `.mjs`，零依赖，不经 Electron、不 import src/。DeepSeek V4-Flash。

**Spec:** docs/superpowers/specs/2026-07-29-wordbook-topic-cluster-redesign.md

## Global Constraints（逐字遵守）
- **话题互斥**：5 本各自话题清单不重叠（见 Task 1 的 BOOKS 定义），跨本零重复靠话题互斥为主、全局 `assigned` Set 兜底。
- **不设硬词量目标**：移除 `count` 字段；每本"该挖多少挖多少"，连续 `EXHAUST_BATCHES`(=2) 批新增 < `EXHAUST_NEW_THRESHOLD`(=5) 即停。
- **聚类排列**：prompt 要求同话题内按词根/同义族相关排列；`pool` 用数组保聚类插入序，落盘即此顺序。
- **不动**：`callDeepseek`、`callAndParse`（重试+调试输出）、`extractJsonArray`（截断容错）、`parseWordArray`/`parseContentArray`、阶段2 全流程、断点文件读写、CLI、key 安全（只走 `DEEPSEEK_API_KEY` 环境变量，绝不打印/落盘）。
- **基线**：本改造基于 `scripts/gen-wordbook.mjs` 当前工作区状态（含初版 + 真跑热修：重试/JSON截断容错/小批量补生成/max_tokens=8000）。当前工作区还有未提交的包1（src/ 同词拦截，独立，不在本 plan 范围）。
- bash 命令必须 `cd /c/Users/kingdee/Desktop/Tasymize && ` 前缀（工作目录会漂移到 c:\Users\kingdee）。
- 脚本无单测（一次性工具，计划既定）；验证靠 `node --check` + `--help` + 用户真跑 `--only-wordlist`。
- 文件 UTF-8、JSON 2 空格缩进；注释中文。

---

## File Structure

只改一个文件：
- **Modify**: `scripts/gen-wordbook.mjs` —— `BOOKS` 定义（约 46-87 行）、批次常量（约 39-43 行）、`WORDLIST_SYSTEM` prompt（约 278-282 行）、`genWordlist` 函数（约 284-334 行）、`stage1` 日志（约 351 行）、`main` 日志（约 528 行）。

不改：阶段2（约 360+ 行）、`callDeepseek`/`callAndParse`/`extractJsonArray`/`parse*`、断点读写、CLI、`estTokens` 累加变量。

---

## Task 1: 改造生成策略（话题版 BOOKS + 穷举 genWordlist + 聚类 prompt）

**Files:**
- Modify: `scripts/gen-wordbook.mjs`

**Interfaces:**
- Consumes: `callAndParse(system, user, maxTokens, parseFn, opts?)`、`parseWordArray(text)`、`normalize(w)`、`WORDLIST_BATCH`(=80)、`assigned`(Set) —— 均已存在，签名不变。
- Produces: `genWordlist(book, assigned)` 返回 `string[]`（聚类顺序、归一化、跨本零重复）；`book` 现在含 `topics` 字段、不含 `count`。

**注意：** Task 1 的 6 个 step 改的是同一函数链，必须全部完成才能 `node --check` 通过（半改会因 `book.count` 残留引用报错）。逐 step 改，最后统一验证。

- [ ] **Step 1: 改批次常量（删补生成常量、加穷举常量）**

定位 `scripts/gen-wordbook.mjs` 约 39-43 行的"批次与重试参数"区。当前是：
```js
const WORDLIST_BATCH = 80 // 阶段1 每批生成候选词数
const CONTENT_BATCH = 15 // 阶段2 每批配内容的词数
const OVERGEN_RATIO = 1.2 // 阶段1 过量生成比例（预留去重损耗）
const MAX_TOPUP_ROUNDS = 12 // 阶段1 去重后不足时的补生成轮数上限（小批量多轮后需更大上限）
const MAX_CONSECUTIVE_FAILS = 3 // 阶段2 连续失败批次数上限，达到则中止
```

改为（删 `OVERGEN_RATIO`、`MAX_TOPUP_ROUNDS`；加 3 个穷举常量；`WORDLIST_BATCH`/`CONTENT_BATCH`/`MAX_CONSECUTIVE_FAILS` 原样保留）：
```js
const WORDLIST_BATCH = 80 // 阶段1 每批挖词数
const CONTENT_BATCH = 15 // 阶段2 每批配内容的词数
const EXHAUST_NEW_THRESHOLD = 5 // 穷举：单批新增少于此数视为低产出
const EXHAUST_BATCHES = 2 // 穷举：连续这么多批低产出即认定话题挖尽、停止
const MAX_BATCHES_PER_BOOK = 30 // 穷举：每本最多批数兜底（防 AI 一直吐重复词死循环）
const MAX_CONSECUTIVE_FAILS = 3 // 阶段2 连续失败批次数上限，达到则中止
```

- [ ] **Step 2: 重写 BOOKS 定义为 5 本话题版**

定位约 45-87 行的 `const BOOKS = [...]`（当前 5 本含 `count`/`topicHint`）。整段替换为（移除 `count`，`topicHint` → `topics` 话题清单）：
```js
// —— 五本词书：按话题聚类切分（话题互斥 → 跨本零重复；话题内按词根/词义聚类排列）。
// 难度隐含递进（日常→校园→社会→科技→公共），desc 口语化、不明写分层。无固定词量目标（穷举式）。 ——
const BOOKS = [
  {
    id: 'ielts-daily',
    name: '居家出行',
    topics: '住房、交通出行、饮食、购物消费、旅游、银行理财',
    desc: '租房、点餐、购物、出行、旅游这些日常场景里高频出现的词，听力前两 section 最爱考，也是最该先眼熟的一批。',
  },
  {
    id: 'ielts-campus',
    name: '校园健康',
    topics: '教育学习、课程学术、医疗就医、运动健身',
    desc: '选课、论文、看病、运动这类校园和健康场景词，听力 section 3、口语和写作教育题反复用到。',
  },
  {
    id: 'ielts-society',
    name: '社会文娱',
    topics: '家庭人口、社会问题、文化传统、媒体、艺术、体育',
    desc: '家庭、社会议题、文化、媒体、艺术、体育相关词，口语拓展和写作论述里高频出现的人文向词汇。',
  },
  {
    id: 'ielts-tech-env',
    name: '科技环境',
    topics: '科技发展、互联网、环境污染、气候变化、能源、动物保护',
    desc: '科技、互联网、环境、气候、能源话题词，写作大作文最常考的两大话题合并，议论文必备。',
  },
  {
    id: 'ielts-public',
    name: '政经法理',
    topics: '政府政策、法律、犯罪、经济贸易、商业职场、抽象评价词',
    desc: '政府、法律、犯罪、经济、工作及一批抽象评价/逻辑词，议论文进阶用词，冲 7+ 的高分向词汇。',
  },
]
```

- [ ] **Step 3: 改 WORDLIST_SYSTEM prompt（加聚类排列要求）**

定位约 278-282 行。当前是：
```js
const WORDLIST_SYSTEM = `你是雅思词汇专家，帮备考雅思（目标 7+）的中国大学生挑选词汇。
要求：
- 只返回英文单词（或常见词组），小写，每批内部不重复
- 雅思向：考试真实高频/有用的词，避免太基础的（如 good/big/happy）
- 严格返回 JSON 数组（纯字符串数组），不要任何额外文字、不要 markdown 代码块`
```

改为（新增第 3 条聚类排列要求）：
```js
const WORDLIST_SYSTEM = `你是雅思词汇专家，帮备考雅思（目标 7+）的中国大学生挑选词汇。
要求：
- 只返回英文单词（或常见词组），小写，每批内部不重复
- 雅思向：考试真实高频/有用的词，避免太基础的（如 good/big/happy）
- 同话题内按词根或词义相关聚类排列：同义词族、同词根的词挨在一起（如 debate/argue/discuss/controversy/dissent；pollute/pollution/pollutant；economy/economic/economical）
- 严格返回 JSON 数组（纯字符串数组），不要任何额外文字、不要 markdown 代码块`
```

- [ ] **Step 4: 重写 genWordlist 为穷举式**

定位约 284-334 行整个 `genWordlist(book, assigned)` 函数（当前是"need=count×1.2 → 批次 → 全局分配截断到 count → 补生成到 count"逻辑）。整段替换为：
```js
// 穷举式生成：针对 book.topics 反复挖词，挖到自然枯竭（连续 EXHAUST_BATCHES 批新增 < EXHAUST_NEW_THRESHOLD）即停。
// 不设词量目标——话题能出多少出多少。pool 用数组保留 AI 返回的聚类插入序（同话题词根相近词挨着）。
// 每批 prompt 附"已选词（前 300 截断）"让 AI 避重，提高穷举效率。assigned 是全局 Set，跨本零重复兜底。
async function genWordlist(book, assigned) {
  const pool = [] // 本本已选词（数组保聚类顺序 + 供 prompt 避重）
  const poolSet = new Set() // 快速判重
  let lowYield = 0 // 连续低产出批数
  for (let b = 1; b <= MAX_BATCHES_PER_BOOK; b++) {
    const avoid = pool.slice(0, 300).join(', ') // 附已选词让 AI 避重（截断控 prompt 长度）
    console.log(`  批次 ${b}：挖「${book.topics}」话题词（已选 ${pool.length}）…`)
    const words0 = await callAndParse(
      WORDLIST_SYSTEM,
      `话题：${book.topics}。再给 ${WORDLIST_BATCH} 个雅思向单词。${avoid ? `不要与这些已给过的词重复：${avoid}` : ''}
同话题内按词根/同义族相关排列。`,
      8000, // 80 词 JSON 留足余量，避免 max_tokens 截断
      parseWordArray,
    )
    let added = 0
    for (const w of words0) {
      if (assigned.has(w) || poolSet.has(w)) continue // 跨本已占 / 本本已选 → 跳过
      poolSet.add(w)
      pool.push(w) // 保留聚类插入序
      added++
    }
    console.log(`    本批新增 ${added}（累计 ${pool.length}）`)
    // 自然枯竭判定：连续 EXHAUST_BATCHES 批新增 < EXHAUST_NEW_THRESHOLD 即停
    if (added < EXHAUST_NEW_THRESHOLD) {
      if (++lowYield >= EXHAUST_BATCHES) {
        console.log(`  [自然枯竭] 连续 ${EXHAUST_BATCHES} 批新增 < ${EXHAUST_NEW_THRESHOLD}，话题池挖尽，停止`)
        break
      }
    } else {
      lowYield = 0
    }
  }
  // 登记到全局 assigned（跨本零重复）
  for (const w of pool) assigned.add(w)
  return pool
}
```

- [ ] **Step 5: 适配 stage1 日志（移除 book.count 引用）**

定位 `stage1` 函数内约 351 行。当前是：
```js
    console.log(`[${book.id}] ${book.name} 目标 ${book.count} 词…`)
```
`book.count` 已不存在（穷举无目标）。改为：
```js
    console.log(`[${book.id}] ${book.name}（话题：${book.topics}）…`)
```
（注：紧邻的 353 行 `分得 ${wordlist[book.id].length} 词…` 不含 count，原样保留。）

- [ ] **Step 6: 适配 main 日志（移除 book.count 引用）**

定位 `main` 函数内约 528 行。当前是：
```js
  console.log(`目标词书：${targetBooks.map((b) => `${b.id}(${b.count})`).join('、')}，模型 ${MODEL}`)
```
`b.count` 已不存在。改为：
```js
  console.log(`目标词书：${targetBooks.map((b) => b.id).join('、')}，模型 ${MODEL}`)
```

- [ ] **Step 7: 验证语法 + 启动正常**

Run: `cd /c/Users/kingdee/Desktop/Tasymize && node --check scripts/gen-wordbook.mjs`
Expected: 无输出、退出码 0（语法 OK）。

Run: `cd /c/Users/kingdee/Desktop/Tasymize && node scripts/gen-wordbook.mjs --help`
Expected: 打印用法，`--book` 列出 5 个新 id（ielts-daily / ielts-campus / ielts-society / ielts-tech-env / ielts-public），退出码 0。

Run: `cd /c/Users/kingdee/Desktop/Tasymize && npm test`
Expected: 18 文件 131 用例全绿（脚本改动不影响测试，仅确认未误伤）。

**Task 1 暂不 commit**（等 Task 2 评审 + Task 3 真跑通过后统一提交）。

---

## Task 2: reviewer 评审 diff

**Files:** 只审 `scripts/gen-wordbook.mjs` 的 Task 1 改动。

- [ ] **Step 1: 派 reviewer（sonnet）审**

评审要点（写进给 reviewer 的 prompt）：
1. `git diff scripts/gen-wordbook.mjs` 确认只改了 Task 1 范围（BOOKS/常量/prompt/genWordlist/stage1日志/main日志），无夹带、未误改阶段2/容错/断点/CLI。
2. **穷举正确性**：`pool`(数组)+`poolSet` 去重一致；`assigned` 跨本兜底；自然枯竭判定（连续 EXHAUST_BATCHES 批 added < THRESHOLD）逻辑正确；`MAX_BATCHES_PER_BOOK` 兜底防死循环。
3. **聚类顺序**：`pool` 用数组保留 AI 返回插入序（parseWordArray 已 normalize+保序），落盘即聚类顺序，未被 Set/排序破坏。
4. **count 残留**：grep 确认脚本内无 `book.count`/`.count)`/`OVERGEN_RATIO`/`MAX_TOPUP_ROUNDS` 残留（528 日志、351 日志、genWordlist 内全清）。
5. **prompt 避重**：`avoid` 前 300 截断合理；空 pool 时 avoid 为空串不报错（模板 `${avoid ? ... : ''}`）。
6. key 安全仍 OK（本次未碰）。
7. `node --check` + `npm test` 绿。

输出 Ready/Not Ready + 分级问题。若 Not Ready，SendMessage 给 Task 1 implementer 修，复审。

---

## Task 3: 真跑验证（用户挂 key，质量门）

**Files:** 无代码改动；用户在真实环境跑脚本。

- [ ] **Step 1: 用户删占位词书 + 跑阶段1**

提示用户（已删 ielts-sample.json 的前提下）：
```
cd C:\Users\kingdee\Desktop\Tasymize
$env:DEEPSEEK_API_KEY="sk-你的key"
node scripts/gen-wordbook.mjs --only-wordlist
```

- [ ] **Step 2: 确认穷举达标 + 聚类质量**

跑完后核对（用户报告，主代理判断）：
1. **五本均能穷举到自然停止**：日志每本以 `[自然枯竭]` 收尾，无"补生成词穷中止"、无"重试3次仍失败"。
2. **每本产出 500–800、合计 ~3000**（不强求，但不应再有 154 这种极端低值；若某本仍 <300，回看是否该话题本身词少或 prompt 避重失效）。
3. **抽查 `scripts/.wordlist.json` 聚类质量**：同话题词聚一起、词根相近词挨着、非字母序堆砌、跨本无重复（抽几个词全局搜确认）。
4. **词的话题归属合理**（居家出行本里是住房交通类词，不是政府经济类）。

- [ ] **Step 3: 满意后跑全量生成 + commit**

质量达标后，用户跑全量：
```
node scripts/gen-wordbook.mjs
```
生成 5 本 `data/wordbooks/ielts-*.json`。确认 `listWordbooks` 能加载（`npm test` 绿 + 启 App 看词书页）。

通过后提交（主代理执行）：
```bash
cd /c/Users/kingdee/Desktop/Tasymize
git add scripts/gen-wordbook.mjs data/wordbooks/ielts-daily.json data/wordbooks/ielts-campus.json data/wordbooks/ielts-society.json data/wordbooks/ielts-tech-env.json data/wordbooks/ielts-public.json docs/superpowers/specs/2026-07-29-wordbook-topic-cluster-redesign.md docs/superpowers/plans/2026-07-29-wordbook-topic-cluster.md
git commit -m "feat(wordbook): 脚本改话题聚类+穷举式生成，生成5本话题版词书"
```
（注：包1 src/ 同词拦截是独立完整改动，单独 commit；脚本相关改动作为另一个 commit。占位 ielts-sample.json 按计划删除。）

---

## 验证（端到端）
- `node --check scripts/gen-wordbook.mjs` 语法 OK。
- `node scripts/gen-wordbook.mjs --help` 列出 5 个话题版 id。
- `npm test` 18 文件 131 用例全绿。
- 真跑 `--only-wordlist`：五本自然枯竭、每本 500–800、聚类排列、跨本零重复。
- 真跑全量：生成 5 本 JSON，`listWordbooks` 加载正常、词书页可见。

## 后续（本计划之外）
- 5 本生成后，按 spec/plan I-1 过渡清单把 `tests/wordbook.test.ts`、`wordbook-batch.test.ts`、`vocab-dup.test.ts` 的 `'ielts-sample'` 换成真实书 id、恢复 listWordbooks 断言。
- 旧两本（ielts-core/ielts-academic）已删，5 本话题版替换。
