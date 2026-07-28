# 离线词书生成脚本 + 生词库同词导入拦截

日期：2026-07-28
分支：feat/v1-popup-tray
状态：已确认，待实施

## Context（为什么做）

两件事，都围绕"内置预置词书"：

1. **离线词书生成脚本**：用户要 5 本全新内置预置词书（仿不背单词，合计 ~4000 词，单词+释义+例句），
   用 DeepSeek V4-Flash 离线批量生成（已论证比 Kimi K3 便宜 ~50 倍；Kimi 199 会员不含 API 额度）。
   核心约束：AI 自由想词会跨词书重复，而"相同单词不支持导入"——必须**先生成全局去重词表 → 切成五本 → 再逐词配内容**，结构上保证跨书零重复。
2. **生词库同词导入拦截**：手动添加 + AI 生成勾选（都走 `vocab:add`）时，同词已在库则拦截拒绝。

## 已确认决策（用户拍板）
- 模型：DeepSeek V4-Flash（离线脚本独立配 key，不经 Electron 运行时配置）
- 词量：维持 ~4000（真题高频1200 / 听说场景800 / 读写学术800 / 同义替换700 / 高分进阶500）
- 单词来源：方案 A——AI 生成单词清单，脚本全局去重切分
- **现有两本词书（ielts-core 85 词 / ielts-academic 76 词）直接删掉不要**，用 5 本全新词书替换（用户明确："把现有的两本词书直接清理掉不要了"）。两本间原有 7 个重复词随删除自然消失。
- 查重范围：**含回收站**（vocab + trash 一起查，防止还原后出现重复）
- 拦截落点：**`vocab.ts` 的 `addVocab`**（数据层检重抛错；测试直接测 addVocab 不碰 ipcMain；词书批量导入有自己的 inLib 跳过逻辑不受影响）

## 关键探索事实
- **脚本机制**：项目 `type:commonjs`、无 tsx/ts-node，但有 esbuild（vitest 传递依赖）。最省事=纯 `.mjs` 脚本（`scripts/gen-wordbook.mjs`），Node 直跑零新依赖，照抄 `src/main/ai.ts` 的 `callDeepseek` fetch 逻辑（`DEFAULT_BASE_URL=https://api.deepseek.com`、`DEFAULT_MODEL=deepseek-v4-flash`）。不 import 主进程模块（避免拖入 electron-store/settings）。
- **word 归一化**：代码对 word 无任何归一化（全 src 无 toLowerCase），现有数据全小写干净。检重必须 `trim().toLowerCase()` 后比对，否则形同虚设。
- **前端配合**：`ExpressionsView.add()`（32行）无 try/catch，IPC reject 会 unhandled；`AiGenModal.addSelected()` 会把"已存在"当中断错误、重复词卡死整批。两处都需配合改。
- **测试模式**：无测 ipc.ts handler 的先例，全测 vocab/wordbook 层；`beforeEach(_resetStoreForTests())`；直接 import 主进程模块。

---

## 设计

### 功能一：生词库同词导入拦截

**1. `src/main/vocab.ts` — `addVocab` 检重**
- 开头加归一化查重：`const w = e.word.trim().toLowerCase()`，扫 `vocabBox` + `trashBox`（含回收站）。
- 命中则 `throw new Error('「X」已在生词库中，不支持重复导入')`（X 用原始 word，不 lowercase，给用户看原样）。
- 注意：`word` 入库时仍按原样存（不强制 lowercase，尊重用户输入；只查重时归一化）。
- 词书批量导入路径（`wordbook.ts` addWordbookToPlan / addWordsToPlan）也走 addVocab——但它们已有 inLib 跳过逻辑，且词书全局去重后不会有重复，正常不会触发；若意外触发（如词书词与用户手动词撞车）抛错是**正确行为**（防止重复入库）。

**2. `src/renderer/manager/views/ExpressionsView.tsx` — add() 补 try/catch**
- 包 try/catch，catch 里 `setAiMsg({kind:'err', text: err.message})`（复用现有 aiMsg 机制）。
- 剥 Electron 包装前缀：`Error invoking remote method 'vocab:add': Error: xxx` → 取 `xxx`。可加个小工具或内联 `.replace(/^Error invoking remote method '[^']+': Error: /, '')`。
- 成功才清空表单；失败保留输入（用户可改词重试）。

**3. `src/renderer/manager/views/AiGenModal.tsx` — "已存在"当跳过而非中断**
- addSelected 循环里，单个词 addVocab 抛"已存在"时：`doneRef.current.add(i)` 后 `continue`（跳过该词，不中断整批）。
- 用错误消息关键词判断（如 includes('已在生词库')）或更稳的方式（见下"错误标识"）。
- 循环结束后若全部完成→onAdded+onClose；若有真错误（非重复）→显示已加入 N/M + 原因。

**错误标识**：为让前端能区分"重复"vs其他错误，throw 的消息固定含关键词（如统一前缀 `DUPLICATE:` 或固定文案），前端据此 skip。简单起见用固定文案 includes 判断。

**4. 测试 `tests/vocab-dup.test.ts`（新增）**
- addVocab 同词（同大小写）→ 第二次抛错
- 同词不同大小写（'Significant' vs 'significant'）→ 抛错（归一化生效）
- 删除到回收站后再加同词 → 抛错（含回收站查重）
- 还原后可正常…（视逻辑定）
- 不同词正常添加

### 功能二：离线词书生成脚本 `scripts/gen-wordbook.mjs`

**结构**（单文件 ESM，Node 直跑，零新依赖）：
1. **callDeepseek**：照抄 ai.ts 的 fetch 逻辑（chat/completions，Bearer，AbortController 超时，401/429/5xx 报错）。从环境变量读 key：`DEEPSEEK_API_KEY`（不硬编码，不进 git）。
2. **五本定义**：数组 `[{id, name, desc, count, topicHint}]`，desc 仿现有口语化风格。topicHint 喂给 AI 选词。
3. **阶段1·生成全局去重词表**：
   - 对每本，分批让 AI 生成候选单词（每批 ~50-100 个纯单词，要求雅思向、避免太基础）。
   - 汇总后 `trim().toLowerCase()` 全局去重，按各本 count 分配（先到先得/按本意向）。
   - 落盘 `scripts/.wordlist.json`（断点）。
4. **阶段2·逐词配内容**：
   - 对每词，分批（每批 ~10-20 词）让 AI 返回 `[{word, meaning, example, topic}]`（meaning 带词性，格式同现有词书）。
   - 复用 parseVocabArray 类似容错解析（strip fence、校验三字段）。
   - 每批成功即追加写入 `data/wordbooks/<id>.json` + 更新 `scripts/.progress.json`（断点续跑：重跑时跳过已完成的词）。
5. **去重兜底**：阶段2 入库前再次确认全局无重复（防御 AI 阶段1 漏检）。
6. **失败重试**：单批失败记日志、可中断；重跑从 .progress.json 继续。

**CLI**：`node scripts/gen-wordbook.mjs [--book <id>] [--only-wordlist]`，默认全跑。
**删除旧词书**：`git rm data/wordbooks/ielts-core.json data/wordbooks/ielts-academic.json`（用户确认不要了）。

**token 预算**：阶段1（~4000 词清单，批量）~5万 token；阶段2（~4000 词 × 输出~60）~30-40万 token。V4-Flash 总计 < ¥1。

### 不做 / 边界
- 脚本不进 Electron 运行时、不读用户 config.json；key 走环境变量。
- 不恢复被删的两本旧词书（用户明确不要）。
- 脚本本身不写单测（一次性工具），但生成结果 JSON 可被现有 wordbook 测试/加载验证。

### ⚠️ 过渡清单（占位词书 ielts-sample 的生命周期，opus 终审 I-1）
过渡期 `data/wordbooks/` 只有占位词书 `ielts-sample.json`（5 词，支撑依赖真实词书的测试）。正式生成 5 本前后的正确顺序：

1. **跑脚本前**：先删除 `data/wordbooks/ielts-sample.json`。
   否则脚本阶段2 启动会扫到这 5 个占位词进全局去重 Set，把正式词书里的同词（全是高频词）永久拦下。
   若已生成完才删 → 重跑一次脚本即可补缺（断点续跑会把 missed 词重新进 remaining 补上）。
2. **生成 5 本后**：把以下三个测试文件里硬编码的 `'ielts-sample'` 换成真实书 id（如 `ielts-essential`），否则占位删除后这三个文件全红：
   - `tests/wordbook.test.ts`
   - `tests/wordbook-batch.test.ts`
   - `tests/vocab-dup.test.ts`（"词书导入撞词"用例，词 significant/controversial 与占位书对齐，换 id 时确认新书也含这些词或同步换词）
   另：`tests/wordbook.test.ts` 的 `listWordbooks` 断言已从 `>=2` 放宽为 `>=1`，新书就绪后恢复。
3. **建议首次真跑**：先 `--only-wordlist` 人工抽查词表质量（AI 选词是否靠谱、有无标点粘连），再跑阶段2。

---

## 包划分与执行顺序

1. **包1 同词拦截**（vocab.ts + 两前端 + 测试）→ reviewer → opus
2. **包2 删旧词书 + 离线脚本**（scripts/gen-wordbook.mjs + git rm 旧词书）→ reviewer → opus
   - 脚本本身用户离线运行（用户自己挂 key），代码评审聚焦逻辑正确性
3. progress.md 记录

## 验证
- 包1：`npm test` 绿（含新增 dup 测试）、`npm run build` 过；手动：ExpressionsView 加重复词显示"已存在"不崩、AiGenModal 重复词跳过不卡死。
- 包2：`node scripts/gen-wordbook.mjs --only-wordlist` 小跑验证（用户挂 key）、生成的 JSON 能被 wordbook.ts listWordbooks 正常加载、跨书 grep 无重复词、desc/格式与现有一致。
