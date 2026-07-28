# 读音实现计划（有道 dictvoice 真人发音）

日期：2026-07-28
分支：feat/v1-popup-tray，BASE bf8911c（回收站完成态）
背景：用户后续功能 ③（读音）。调研后定方案=**纯有道 dictvoice**（speechSynthesis 在 Electron/Windows 有 getVoices 空/音色差等可靠性坑，弃用兜底）。

## 用户决策（已确认）
- **方案：纯有道 dictvoice**。真人录音，英音贴近雅思听力。
- **落点**：弹窗正面 word 旁 + 生词库列表每行 word 旁，加 🔊 图标，**点才读**（不自动——被动不打扰理念，弹窗自动出声会打扰打游戏）。
- **英/美音**：设置开关，默认**英音**（雅思 A 类听力以英音为主）。

## 技术依据（WebSearch 确认）
- 有道 dictvoice：`https://dict.youdao.com/dictvoice?audio={word}&type={1|2}`，type=1 英音 / type=2 美音，GET 返回 MP3。稳定多年。
- **渲染端直接播有道 URL 会被 CSP（default-src 'self'）/跨域拦** → 走主进程代理 fetch：IPC 返回 base64 data URL，渲染端 `new Audio(dataURL).play()`。主进程无 CSP 限制。
- CSP 调整：渲染端播 `data:audio/mpeg;base64,...` 需 `media-src` 允许 `data:`（查现有 CSP 配置位置——index.html meta 或 session.webRequest，子代理核实并调整）。

---

## 全局约束（精确值，子代理逐字遵守）

1. **新增设置** `audio_accent: 'british'`（DEFAULT_SETTINGS 加；默认英音）。british→type=1，american→type=2。
2. **纯函数 `accentToType(accent): 1 | 2`** + **`buildPronunciationUrl(word, accent): string`**（URL encode word），导出可测。
3. **`fetchPronunciation(word, accent): Promise<string>`**（返回 base64 data URL）：fetch 有道 URL（AbortController 超时 ~10s），拿 MP3 buffer，转 `data:audio/mpeg;base64,{b64}`。失败抛 Error。
4. **IPC `audio:pronounce(word)`**：读 `audio_accent` 设置 → fetchPronunciation → 返回 data URL。失败抛 Error（渲染端 catch 静默）。
5. **preload + TasymizeApi**：暴露 `pronounce(word): Promise<string>`（返回 data URL）。
6. **前端共享播放**：渲染端 `playWord(word)` 工具函数——调 `window.tasymize.pronounce(word)` 拿 dataURL → `new Audio(dataURL).play()`（.catch 静默吞失败，不阻断）。可放 PopupCard 内或抽共享模块。
7. **弹窗 PopupCard 正面**：word 旁加 🔊 按钮（`onMouseDown={stopMouseDown}` 防误触翻卡/拖拽，同评分按钮模式），点击 → playWord(item.word)。
8. **生词库 ExpressionsView row**：word 旁加 🔊 按钮（group-hover 显示或不 hover 常显，与现有操作组一致），点击 → playWord(e.word)。
9. **设置页 SettingsView**：加「发音」卡片——英音/美音两选（两个按钮或 segmented，accentBg 高亮选中；跟主题色/分段按钮既有模式）。默认 british 高亮。
10. **CSP**：核实并调整使渲染端能播 `data:` 音频（若现有 CSP 拦）。
11. **不动**：scheduler/hotkey/popup/popup showPopup 逻辑/engine/trash/vocab 结构。

---

## 包划分

### 包1 后端（fetch + URL 纯函数 + IPC + 设置，TDD）
文件：`src/main/audio.ts`（新）、`src/main/settings.ts`（DEFAULT_SETTINGS audio_accent）、`src/main/ipc.ts`、`src/preload/index.ts`、`src/shared/ipc-types.ts`、`tests/`

1. audio.ts：`accentToType` / `buildPronunciationUrl`（纯函数，URL encode word）+ `fetchPronunciation(word, accent)`（fetch + 超时 + base64 data URL）。
2. settings.ts：DEFAULT_SETTINGS 加 `audio_accent: 'british'`。
3. ipc.ts：`audio:pronounce(word)` handler。
4. preload + ipc-types：暴露 + 签名。
5. TDD（tests/audio.test.ts）：accentToType（british→1/american→2/默认→1）、buildPronunciationUrl（word encode、type 拼对）。fetchPronunciation 本身（需网络）不单测，靠真机。
6. `npm test` 绿 + `npm run build` 过。

### 包2 前端（弹窗🔊 + 列表🔊 + 设置卡片 + CSP）
文件：`src/renderer/popup/PopupCard.tsx`、`src/renderer/manager/views/ExpressionsView.tsx`、`src/renderer/manager/views/SettingsView.tsx`、CSP 配置（核实位置）

1. playWord 工具（PopupCard 内或共享）。
2. PopupCard 正面 word 旁 🔊（stopMouseDown 防误触）。
3. ExpressionsView row word 旁 🔊。
4. SettingsView「发音」卡片（英/美 segmented）。
5. CSP 核实调整（允许 data: 音频）。
6. `npm run build` 过。

---

## 执行顺序与评审
1. 本 plan（✅）
2. **包1 后端子代理**（TDD）→ reviewer → 修复
3. **包2 前端子代理** → reviewer → 修复
4. 主代理核查 diff
5. **最终 whole-branch 评审（opus）**
6. progress.md 记录

## 真机验证点（用户做）
- 弹窗正面 word 旁 🔊 点击 → 有英音
- 生词库每行 🔊 点击 → 有声
- 设置切美音 → 🔊 变美音
- 生僻词/特殊字符词能否发音（有道覆盖度）
- 断网时 🔊 点击静默不崩
