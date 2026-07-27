# AI 内容生成实现计划（主题词组生成 + 生词 AI 翻译）

日期：2026-07-27
分支：feat/v1-popup-tray，BASE fd63b21
背景：V2 第一优先（用户明确"AI 生成词组/例句比壳功能更重要"）。provider 基建（ai.ts callDeepseek + ai:test 测试连接）已就绪。本次做内容生产两个功能。

## 全局约束（精确值，子代理逐字遵守）

1. **功能 A `generateThemeVocab(theme, n=30)`**：AI 生成 30 个主题词组，返回 `[{word, meaning, example}]` **预览（不入库）**——入库由前端勾选后循环 `vocab:add`。
2. **功能 B `translateVocab(word)`**：AI 返回 `{meaning, example}` **预览（不入库）**。
3. **JSON 容错**：AI 返回可能裹 markdown code block（```json ... ```）。解析先 strip code block 再 `JSON.parse`，字段缺失/类型错/解析失败 → 抛 Error。提取**纯函数** `parseVocabArray(text)` / `parseVocabObject(text)` 导出可测。
4. **IPC**：`ai:generateTheme(theme: string, n: number)` → `[{word,meaning,example}]`；`ai:translate(word: string)` → `{meaning,example}`。错误统一抛（渲染端 catch 显示）。
5. **入库**（前端复用 `vocab:add`）：
   - A：`{status:'new', book:null, topic:theme, source:'AI主题:'+theme}`
   - B：`{status:'learning', book:null, topic:null, source:'AI翻译'}`
6. **key 没配**：返回错误"请先在设置配置 DeepSeek API key"。
7. **前端入口都在生词库页**（ExpressionsView）：
   - A：header 旁加「AI 主题生成」按钮 → 弹 modal
   - B：新增卡片 word 输入框旁加「AI 翻译」按钮
8. **快捷话题预设**（modal 里 6 个按钮）：教育 / 科技 / 环境 / 社会 / 文化 / 健康
9. **modal 流程（A）**：主题输入（自由文本）+ 6 快捷话题 →「生成 30 个」→ loading（callDeepseek 约 10-30s，按钮禁用 + "生成中…"）→ 结果列表（勾选框 + word + meaning，点行展开 example）+「加入所选(N)」→ 批量 vocab:add → 关 modal + reload
10. **B 流程**：word 输入 +「AI 翻译」→ loading → meaning/example 自动填入新增卡片后两框（用户过目可改）→ 复用现有「新增生词」
11. **错误提示**：inline 文字（跟设置页 ai:test 同风格），**不用**系统 alert
12. **UI 风格**：复用卡片化 + theme 类（accentSolid/accentText/bgCard）+ 零古风；modal 半透明底 + backdrop-blur

## prompt 设计（implementer 逐字用或微调，reviewer 审合理性）

**A system**：
```
你是雅思词汇专家，帮备考雅思（目标 7+）的中国大学生生成主题相关的高频学术词组。
要求：
- word：英文单词或词组（雅思写作/口语高频学术词，避免太基础的如 good/bad/big）
- meaning：简明中文释义
- example：地道英文例句，体现该词用法
严格返回 JSON 数组，每个元素 {"word","meaning","example"}，不要任何额外文字、不要 markdown 代码块。
```
**A user**：`主题：「{theme}」。生成 {n} 个雅思高频词组。`

**B system**：
```
你是雅思词汇助手。给定英文词，返回中文释义和地道英文例句。
严格返回 JSON {"meaning","example"}，不要额外文字、不要代码块。
```
**B user**：`词：「{word}」`

## 任务1（包1 后端 AI，TDD）

文件：`src/main/ai.ts`、`src/main/ipc.ts`、`src/preload/index.ts`、`src/shared/ipc-types.ts`、`tests/`

1. ai.ts 加 `generateThemeVocab(theme: string, n = 30): Promise<{word,meaning,example}[]>` 和 `translateVocab(word: string): Promise<{meaning,example}>`，复用 `callDeepseek`（maxTokens 给大些如 4000 容纳 30 词 JSON；temperature 0.7；timeout 90s）
2. 提取并导出 `parseVocabArray(text)` / `parseVocabObject(text)` 纯函数：strip ```json fences + `JSON.parse` + 字段校验（word/meaning/example 为非空字符串），失败抛 Error
3. ipc.ts 加 `ai:generateTheme` / `ai:translate` handler（key 没配返回错误 message）
4. preload 暴露 `generateTheme(theme, n)` / `translate(word)`
5. ipc-types TasymizeApi 加签名
6. 测试（TDD，先红后绿）：`parseVocabArray` 正常 / 带 code block / 缺字段 / 非法 JSON；`parseVocabObject` 同。AI 调用本身不测（需网络/key），靠真机。
7. `npm test` 绿 + `npm run build` 过

## 任务2（包2 前端）

文件：`src/renderer/manager/views/ExpressionsView.tsx`（modal 倾向抽 `AiGenModal` 组件——ExpressionsView 已含 mastered 三段+批量，不宜再膨胀）

1. header 旁「AI 主题生成」按钮 → 打开 AiGenModal
2. AiGenModal：主题输入 + 6 快捷话题按钮 +「生成 30 个」+ loading 态 + 结果勾选列表（展开 example）+「加入所选(N)」批量 vocab:add(status=new) → 关闭 + reload
3. 新增卡片 word 框旁「AI 翻译」按钮 → 调 translate → 填 meaning/example 到输入框
4. 错误 inline 提示
5. `npm run build` 过
