# 已掌握（mastered）终态 + 复习节奏调参 实现计划

日期：2026-07-27
分支：feat/v1-popup-tray
背景：弹窗节拍队列模型（commit 0af4148）目前只有 new/learning/review 三态，词永远在 review 池循环，没有"背完"终态。本计划加第四态 `mastered`（背完不再弹，可复活重背）+ 调小 reviewSteps 适配个人自用节奏。

## 全局约束（精确值，子代理须逐字遵守）

1. **reviewSteps 新默认**：`review_steps_pops = '50,150,350,750,1500'`（旧 `'80,240,560,1200,2400'`）。50 起步、等比缩放保持原曲线形状；倒数第二档 750 = 掌握档。
2. **自动掌握档**：`masterStep = reviewSteps.length >= 2 ? reviewSteps[reviewSteps.length - 2] : reviewSteps[0]`（默认 5 档时 = 750）。判 master 用 `next.interval >= masterStep`。
3. **status 联合类型**扩成 `'new' | 'learning' | 'review' | 'mastered'`，**两处定义都改**：
   - `src/main/vocab.ts` 的 `VocabItem.status`
   - `src/shared/ipc-types.ts` 的 `VocabItem.status`
4. **mastered 不弹**：`getDueVocab` 跳过 `new` **和** `mastered`（只选 learning / review）。
5. **自动掌握触发点**：`applyReview` 的 review 分支，grade===2 算出 `next` 后，若 `next.interval >= masterStep` → `newStatus = 'mastered'`。
6. **掌握后**调 `fillLearningQueue()`（跟毕业一样腾槽位补新词）。
7. **手动 IPC**（新增两个 handler）：
   - `vocab:master`(id)：`updateVocab(id, { status: 'mastered' })`
   - `vocab:revive`(id)：`updateVocab(id, { status: 'learning' })` + `setSrsState(id, { easiness: 2.5, repetitions: 0, duePop: getPopCount() })`
   - revive **不受** learning_cap 限制（用户主动重背，直接进队列立即可弹）
8. **preload** 暴露 `master(id)` / `revive(id)`；`ipc-types.ts` 的 `TasymizeApi` 加 `master(id: number): Promise<void>` / `revive(id: number): Promise<void>`。
9. **迁移 `migrateReviewSteps`**（放 settings.ts，用 settingsBox）：若 `settings.review_steps_pops` 缺失 **或** 等于旧默认 `'80,240,560,1200,2400'` → 设新默认 `'50,150,350,750,1500'`；用户自定义值不动；幂等。在 `main/index.ts` whenReady 里、`migrateSrsToPop()` 之后调用。
10. **前端**：
    - PopupCard 背面：评分三按钮（忘了/印象/记得）**下方**加次要「标为已掌握」按钮 → `window.tasymize.master(item.id)` + `dismiss()`；`stopMouseDown` 防误触拖拽；样式次要（不抢评分主流程，细边框小按钮）。
    - ExpressionsView：新增 mastered 第三段（在 pending 段之后）；徽标金色（`bg-amber-500/15 text-amber-700`，与 review 的 emerald 区分）；每条带「重新背」按钮（revive）；批量操作条加「标为已掌握（N）」（与「删除所选」并列）；顶部计数加"已掌握 {mastered.length}"。

## 任务1（包1 后端，TDD）

文件：`src/main/vocab.ts`、`src/shared/ipc-types.ts`、`src/main/settings.ts`、`src/main/scheduler.ts`、`src/main/ipc.ts`、`src/preload/index.ts`、`src/main/index.ts`、`tests/`

步骤：
1. status 类型加 `mastered`（vocab.ts + ipc-types.ts 两处）
2. settings.ts：`DEFAULT_SETTINGS.review_steps_pops` 改新默认；新增 `migrateReviewSteps()`；`scheduler.opts()` 的 reviewSteps fallback 默认 `[50,150,350,750,1500]`
3. scheduler.ts：`getDueVocab` 跳 mastered；`applyReview` review 分支 grade2 判 masterStep → mastered + fillLearningQueue
4. ipc.ts：加 `vocab:master` / `vocab:revive` handler
5. preload/index.ts：暴露 master / revive
6. ipc-types.ts：TasymizeApi 加 master / revive 签名
7. main/index.ts：whenReady 调 migrateReviewSteps()（在 migrateSrsToPop 之后）
8. 测试（TDD，先红后绿）：
   - scheduler.test.ts 加：review 连续答对爬到倒数第二档 → status=mastered；mastered 词不被 getDueVocab 选中
   - master/revive 测试：master → status=mastered；revive → status=learning + duePop=now + reps=0
   - 迁移测试：migrateReviewSteps 旧默认→新默认；新默认不动；用户自定义不动
9. `npm test` 全绿 + `npm run build` 过

## 任务2（包2 前端）

文件：`src/renderer/popup/PopupCard.tsx`、`src/renderer/manager/views/ExpressionsView.tsx`

步骤：
1. PopupCard.tsx：背面评分按钮区下方加「标为已掌握」按钮（master+dismiss+stopMouseDown，次要样式）
2. ExpressionsView.tsx：
   - statusBadge 加 mastered（金色 `bg-amber-500/15 text-amber-700`）
   - 分组：active(learning+review) / pending(new) / mastered
   - 渲染顺序：active 段 →「待学习」分界 → pending 段 →「已掌握」分界 → mastered 段（每条「重新背」按钮）
   - 批量条加「标为已掌握（N）」（选中→批量 master）
   - 顶部计数加"已掌握 {mastered.length}"
3. `npm run build` 过
