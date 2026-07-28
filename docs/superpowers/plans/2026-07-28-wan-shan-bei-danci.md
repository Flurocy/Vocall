# 完善背单词实现计划（真机 UI 修复 + 词性 + 易忘词标记）

日期：2026-07-28
分支：feat/v1-popup-tray，BASE adda20a（AI 内容生成完成态）
背景：用户 2026-07-27 真机反馈 4 个 UI 问题 + 裁决补充建议——只要"原计划漏项"，易忘词标记(⑨)纳入，其余(⑧搭配/⑩统计/⑪例句多场景)不做。

## 全局约束（精确值，子代理逐字遵守）

1. **词性存储 = 方案A（用户拍板）**：AI 把词性拼进 meaning（如 `v. 放弃；抛弃`），**不改动 VocabItem 数据结构、不加字段、不做词性迁移**。解析层不新增 part_of_speech 字段。
2. **易忘词标记 = SrsState.forgotCount + 启动迁移补0（用户拍板）**：忘词计数放 SRS 状态（不污染词项本身），旧数据启动时迁移补 `forgotCount:0`（幂等）。
3. **UI 风格**：复用卡片化 + theme 类（accentSolid/accentText/accentBg/bgCard）+ 零古风；Tailwind v4 JIT 所有类名必须完整字面量。
4. **改动面最小**：每项修复独立、克制，不顺手重构无关代码。

---

## 包1 真机 UI 修复（4 项，前端为主 + AI prompt/解析）

### ① AI译按钮与释义框重合 → 新增卡片布局重排
文件：`src/renderer/manager/views/ExpressionsView.tsx`
现状：`grid grid-cols-3 gap-3` 第一格塞了 `生词input + AI译按钮`，过挤导致 AI译按钮压到第二格释义框。
改法：两行布局——
- 第一行 `flex gap-2`：`生词input(flex-1)` + `AI译按钮(shrink-0)`
- 第二行 `grid grid-cols-2 gap-3`：`释义input` + `例句input`
- 底部「新增生词」按钮 + aiMsg 行保持不变。
- AI译按钮的 `title` 属性**删除**（改由②自绘 tooltip）。

### ② AI译按钮 tooltip 自绘主题色
文件：`ExpressionsView.tsx`（同一处）
原生 `title` 是系统灰底不同步主题。改自绘：
- AI译按钮外层包 `relative group`（若①已包 div 则复用）。
- 按钮下方/上方绝对定位气泡：`absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 whitespace-nowrap rounded-md px-2 py-1 text-xs shadow-md`，底色 `${theme.bgCard}` + 文字 `${theme.accentText}` + 细边 `border border-black/10`。
- 文案「调用 AI 填入释义和例句」。
- 用 `group-hover`（CSS 控制），不用 JS state，避免残留。
- **Tailwind JIT 提醒**：`bgCard`/`accentText` 已是字面量，直接插值进 className 模板串即可（项目既有模式）。

### ③ AI 生成释义加词性（拼进 meaning）
文件：`src/main/ai.ts` + `tests/ai-parse.test.ts`（如需）
- `THEME_GEN_SYSTEM` 与 `TRANSLATE_SYSTEM` 的 prompt 加一条：`- meaning：简明中文释义，开头标注词性缩写（如 n. / v. / adj. / adv. / phr.），格式「词性 释义」，例如「v. 放弃；抛弃」`。
- **不改** parseVocabArray / parseVocabObject 的字段结构（词性就在 meaning 字符串里）。
- 展示端无需改（meaning 原样显示，词性自然出现）。AiGenModal/ExpressionsView/PopupCard 均不动词性逻辑。

### ④ 弹窗背面字号/比例调大
文件：`src/renderer/popup/PopupCard.tsx`
现状背面：`word=text-sm`（比正面 text-2xl 还小，反常）、`meaning=text-xl`、例句 `text-xs max-h-20`、三按钮 `text-sm py-1.5`、已掌握 `text-xs`。
改法（统一提一档 + 比例重排）：
- 背面 `word`：`text-sm` → `text-base`，加 `font-medium`，颜色保留 `text-slate-500`。
- `meaning`：`text-xl` → `text-2xl`（与正面词同级，释义是背面主角）。
- 例句开关按钮：`text-xs` → `text-sm`；例句正文 `text-xs` → `text-sm`，`max-h-20` → `max-h-28`，行距保留 `leading-relaxed`。
- 三评分按钮：`text-sm py-1.5` → `text-base py-2`。
- 「标为已掌握」：`text-xs` → `text-sm`，`py-1` → `py-1.5`。
- 右上角进度角标 `text-[10px]` 不动（角标本就该小）。
- **注意**：弹窗固定 360×240（popup.ts），调大字号后须确认背面内容不溢出——例句区已有 `overflow-y-auto` 兜底，可接受；若担心可在容器加 `overflow-hidden` 裁切。

---

## 包2 易忘词标记（forgotCount，后端 TDD + 前端展示）

### 包2-后端（TDD）
文件：`src/main/store.ts`、`src/main/srs.ts`（如需）、`src/main/scheduler.ts`、`src/main/index.ts`、`src/main/popup.ts`、`src/shared/ipc-types.ts`、`tests/`

1. **store.ts `SrsState` 加 `forgotCount: number`**（第 8-12 行接口）。注释：点了几次"忘了"（grade 0）。
2. **新增迁移 `migrateForgotCount()`**：遍历 srsStates，缺 `forgotCount` 字段的补 `0`；幂等（已有则不动）。模式照抄 `migrateSrsToPop`/`migrateVocabStatus`。
3. **index.ts** `whenReady` 链在 `migrateSrsToPop()` 后插入 `migrateForgotCount()`。
4. **scheduler.ts `applyReview`**：两处 grade 0 路径给 forgotCount +1——
   - review 态 grade 0（打回 learning 分支，第 77-80 行）
   - learning 态 grade 0（走 `reviewLearning(base, 0, o)` 的 else 分支，第 89-90 行）
   - 实现：`const forgot = (cur?.forgotCount ?? 0) + (grade === 0 ? 1 : 0)`，写回 `setSrsState(id, { easiness, repetitions, duePop, forgotCount: forgot })`。
   - **注意**：`base` 解构不含 forgotCount，setSrsState 现在要多写一个字段；从 `cur` 读旧值，grade 非 0 时原样保留。
5. **popup.ts `showPopup`**：载荷加 `forgotCount: getSrsState(item.id)?.forgotCount ?? 0`。
6. **ipc-types.ts `PopupPayload`** 加 `forgotCount: number` 字段 + 注释（弹窗展示"已忘 X 次"用）。
7. **测试（TDD 先红后绿）**：
   - `migrateForgotCount`：缺字段补 0 / 已有不动 / 幂等跑两次。
   - `applyReview` grade 0 两次 → forgotCount=2；grade 1/2 不增；旧状态无 forgotCount 时 grade0 → 1。

### 包2-前端（展示）
文件：`src/renderer/popup/PopupCard.tsx`、`src/renderer/manager/views/ExpressionsView.tsx`

1. **弹窗背面**：进度角标行下（或 word 旁）加一行小字，仅当 `forgotCount > 0` 显示：`已忘 {forgotCount} 次`，样式 `text-xs text-rose-500/80`（淡红，提示痛点但不刺眼）。位置建议：背面 `word` 行右侧或下方。
2. **生词库列表**：`row(e, action)` 里 word 旁，仅当该词 SRS 的 forgotCount > 0 时显示徽标 `已忘{N}`，样式 `rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-600`。
   - **数据来源问题**：`listVocab()` 返回的 VocabItem **不含** forgotCount（在 SRS 状态里）。列表要显示需另取。
   - 方案：ExpressionsView 增加一个 IPC `srs:getForgotCounts()` → 后端返回 `Record<number, number>`（id→forgotCount），前端 `useState` 存一份，渲染时查。
   - **需配套**：ipc.ts 加 handler、preload 暴露 `getForgotCounts()`、ipc-types 加签名。后端函数放 scheduler.ts 或 store.ts（读 srsStates 汇总）。

---

## 执行顺序与评审

1. 先写本 plan（✅）
2. **包1 子代理开发**（4 项 UI + AI prompt）→ reviewer 评审 → 修复
3. **包2 后端子代理**（TDD）→ reviewer → 修复
4. **包2 前端子代理**（弹窗 + 列表展示 + getForgotCounts IPC）→ reviewer → 修复
5. 主代理自我核查（git show 各包 diff）
6. **最终 whole-branch 评审（opus）**→ 修 triage 出的问题
7. 台账 progress.md 记录每包

## 真机验证点（用户做）
- AI 主题生成真机跑一次：30 词 JSON 解析 + meaning 开头是否带词性（顺带完成漏项 B 的 AI 联调）
- 新增卡片：AI译按钮不再压释义框、hover 出主题色气泡
- 弹窗背面：字号比例是否舒服
- 点"忘了"几次后：弹窗/列表是否显示"已忘 N 次"
