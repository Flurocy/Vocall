# 回收站交互完善 + 空释义提示 实现计划

日期：2026-07-29
分支：feat/v1-popup-tray，BASE d0728fe（5本词书）
状态：规划中

## Context（为什么做）

用户真机验证后反馈 4 点体验缺陷：
1. **词书页不认回收站词**：在回收站里的词，从词书二次添加时被 `addVocab` 查重拦下，加入失败且无提示。根因：`getWordbookWords` 的 `inLibrary` 只扫"同书"vocab（`wordbook.ts:79`），既没扫回收站、也没扫全库，所以回收站词显示"可加入"但实际加不进。
2. **AI 翻译导入回收站词无提示**：AI 翻译填入表单后点新增，若词在回收站，`addVocab` 抛错但文案不区分，用户不知道是"在生词库"还是"在回收站"。
3. **重复提示不区分**：`addVocab` 不管词在 vocab 还是 trash，都抛"已在生词库中"。
4. **新增单词空释义无反应**：`ExpressionsView.add()` 里 `if (!word || !meaning) return` 静默返回，用户只填 word 没填 meaning 时点了没反应。

用户决策：**回收站词在词书页 = 标记"回收站" + 禁选**（不擅自还原，让用户去回收站主动处理）。

## 改动（5 文件 + 测试）

### 1. `src/main/vocab.ts` — addVocab 查重区分文案
当前：扫 vocabBox+trashBox，命中统一抛 `「X」已在生词库中，不支持重复导入`。
改为先查 vocabBox、再查 trashBox，分别抛：
- vocabBox 命中：`「${e.word}」已在生词库中，不支持重复导入`
- trashBox 命中：`「${e.word}」在回收站中，先还原或彻底删除后才能重新加入`
（`e.word` 用原始输入展示。归一化 trim().toLowerCase() 不变。）

### 2. `src/main/wordbook.ts`
- **`WordbookWord` 接口**（70-73）加 `inTrash: boolean`。
- **`getWordbookWords`**（76-81）：`inLib` 改扫**全库** vocab（normalize，不限同书——修"同书盲区"bug）；新增扫 `trashBox` 建 `inTrash` Set；返回 `inLibrary` + `inTrash`。
- **`addWordsToPlan`**（85+）：`inLib` 同步改扫全库（与 getWordbookWords 一致，避免前端禁选的词仍被尝试加入）。
- **`isDupError`**（66-68）：从 `includes('已在生词库')` 改为 `/已在生词库|在回收站/.test(msg)`（两种 dup 都算，批量导入跳过不中断）。

### 3. `src/shared/ipc-types.ts` — `WordbookWord` 类型加 `inTrash: boolean`
（与 wordbook.ts 接口同步；preload 透传不需改。）

### 4. `src/renderer/manager/views/WordbooksView.tsx`
- `selectable`（85）：`!w.inLibrary && !w.inTrash`（回收站词不可选）。
- 复选框 `disabled`（142）：`w.inLibrary || w.inTrash`。
- 徽标（149）：`inLibrary` → 灰"已在库"；`inTrash` → rose"回收站"（区分色，让用户一眼看到去回收站处理）。
- 行样式（137）：`inTrash` 同 `inLibrary` 灰掉（opacity-60）。
- "全选（可加入 N 词）"的 N 自然只算 selectable（已排除回收站/已在库）。

### 5. `src/renderer/manager/views/ExpressionsView.tsx` — add() 空校验提示
当前（32-39）`if (!word || !meaning) return` 静默。改为：
```
if (!word.trim()) { setAiMsg({kind:'err', text:'请输入单词'}); return }
if (!meaning.trim()) { setAiMsg({kind:'err', text:'请补充释义'}); return }
```
（add 的 try/catch 已有 errMsg 显示——addVocab 区分文案后，回收站词会提示"在回收站中…"，覆盖需求 2/3。）

### 6. 测试
- `tests/vocab-dup.test.ts`：加用例——词在回收站时 addVocab 抛"在回收站"（区别于"已在生词库"）；不同词正常。
- `tests/wordbook.test.ts` 或 `wordbook-batch.test.ts`：加用例——词在回收站时 `getWordbookWords` 标 `inTrash=true`、`inLibrary=false`。
- 现有 dup 测试：addVocab 文案改后，确认 isDupError 同步（词书批量撞回收站词仍跳过不中断）。

## 不做 / 边界
- 不自动还原回收站词（用户决策：标记+禁选，主动去回收站处理）。
- 不改回收站页本身（TrashView）。
- 不改 addVocab 之外的查重逻辑（词书批量导入 isDupError 同步即可）。
- 释义丰富化（问题1）是后续独立任务，本计划不含。

## 验证
- `npm test` 全绿（含新增 2-3 条）。
- 真机：
  1. 删一个词进回收站 → 词书页该词显示"回收站"rose 徽标 + 灰掉不可勾选。
  2. 手动加生词库里已有的词 → 提示"已在生词库中"；加回收站里的词 → 提示"在回收站中"。
  3. AI 翻译一个回收站里的词 → 填入后点新增 → 提示"在回收站中"。
  4. 新增单词只填 word 不填 meaning → 提示"请补充释义"。
