# 弹窗独立字体大小滑块（popup_font_scale + zoom）实现计划

日期：2026-07-28
分支：feat/v1-popup-tray，BASE 04d62af（三滑块完成）
背景：用户反馈「字体大小滑块对弹窗没用」。根因——弹窗字体走 rem 联动（`PopupCard.tsx:68` 每次弹窗把根 fontSize 设为 `font_size`），字+padding+间距同比例胀、而窗口物理尺寸不变（那是 popup_scale 管的），字的"视觉变大"被稀释，感觉没生效。

## 用户决策（已确认）
- **弹窗独立字体滑块**：新增 `popup_font_scale`（0.85–1.4，默认 1.0），用 **CSS `zoom`** 只放大弹窗内容、不动窗口尺寸、不动布局间距逻辑。
- 现有「字体大小」滑块（`font_size`）继续管**管理界面**。
- 两者彻底分开。

## ⚠️ 决策修订（终审后）
初版方案（上文旧表述）：`font_size` 继续作弹窗 rem 基准，弹窗字体 = rem × zoom 两链路叠加。
**终审 opus 指出**：此耦合下「管理界面字体」滑块仍会间接影响弹窗字，与"彻底分开"目标矛盾（SettingsView 文案"不影响弹窗字体"成谎话）。
**用户决策：彻底解耦**——弹窗 rem 基准**固定 16px**（PopupCard `ROOT_FONT_PX`），摘除 font_size 联动；弹窗字体**唯一**调节项是 `popup_font_scale` 的 zoom。`font_size` 只消费于管理界面（manager/App.tsx），弹窗 popup/ 目录无 font_size 运行时残留。两窗口独立 BrowserWindow/文档，互不影响。

## 技术选型
- **`zoom`**：Chromium 标准化（Electron 40 = Chromium ~142，支持）。作用于弹窗根容器 `style={{ zoom: scale }}`。
  - 为什么不用 rem：rem 会连 padding/间距一起胀，正是用户嫌"没用"的根因。
  - 为什么不用 transform: scale：会脱离布局、产生位移/裁切，需额外 translate 校正，糊。zoom 是布局级缩放，元素重排、不糊、不位移。
- **范围 0.85–1.4**（默认 1.0）：0.85 缩到 85%（更紧凑），1.4 放到 140%（更大）。比 popup_scale 窄，避免字过大撑破小窗口（背面有 overflow-y-auto 兜底）。
- **不新 IPC**：复用 settings:set——渲染端 PopupCard 每次弹窗已重读 settings（`start()` 里 getSettings），popup_font_scale 跟着一起读即可，主进程无需任何 resize/联动。**主进程零改动**（zoom 纯渲染端）。

## 全局约束（子代理逐字遵守）

1. **settings.ts** DEFAULT_SETTINGS 加 `popup_font_scale: '1.0'`。旧用户无此键走默认（defaults 兜底，无需 migrate）。
2. **theme.ts** 加：
   - `POPUP_FONT_SCALE_MIN = 0.85` / `POPUP_FONT_SCALE_MAX = 1.4` / `POPUP_FONT_SCALE_DEFAULT = 1.0`
   - `getPopupFontScale(value?: string | null): string` —— parseFloat + Number.isNaN + clamp(0.85–1.4) + String，**与 getPopupScale/getPopupOpacity 同策略**（保留精度不取整）。注释标"弹窗内容 zoom 倍率"。
3. **PopupCard.tsx**：
   - 加 state `fontScale`（string），初始 `getPopupFontScale()`。
   - `start()` 的 getSettings.then 里加 `setFontScale(getPopupFontScale(settings.popup_font_scale))`（与 theme/fontSize 一起每次弹窗重读）。
   - 根容器（`PopupCard.tsx:143` 顶层 div）`style={{ fontSize, zoom: fontScale }}`——fontSize 仍设根 fontSize（rem 基准），zoom 整体放大内容。
   - **注意**：zoom 值传字符串数字（'1.2'），React style 接受 number|string；字符串数字 CSS 合法。若 TS 报 zoom 不存在于 CSSProperties，用 `as React.CSSProperties` 兜底（zoom 已标准化，新版 CSSType 应有）。
4. **SettingsView.tsx** 「弹窗外观」卡加第三个滑块「弹窗字体大小」：
   - min POPUP_FONT_SCALE_MIN / max POPUP_FONT_SCALE_MAX / step 0.05
   - value = `parseFloat(getPopupFontScale(settings.popup_font_scale))`
   - onChange → `update('popup_font_scale', e.target.value)`
   - 标签 `弹窗字体大小（{Math.round(v*100)}%）`
   - 说明文案：「只放大弹窗里的字和布局，不动窗口大小」
   - import getPopupFontScale + POPUP_FONT_SCALE_MIN/MAX。
   - 位置：放在「界面大小」「字体大小」之后、「透明度」之前/之后均可（建议界面大小→弹窗字体→字体(管理)→透明度，把弹窗相关的排一起）。**子代理按"弹窗相关排一起"排**：界面大小、弹窗字体、透明度、字体大小(管理界面)。
   - 「字体大小」滑块说明文案改为「管理界面字号（rem 联动）」以区分。
5. **不动**：font_size 逻辑、popup_scale/popup_opacity、scheduler/hotkey/audio、PopupCard 字号层级（text-2xl 等不动，zoom 统一缩）。

## 包划分

### 包1（设置 + 纯函数 + 测试，TDD）
文件：`src/main/settings.ts`、`src/renderer/theme.ts`、`tests/popup-font-scale.test.ts`
1. settings.ts 加 popup_font_scale 默认 '1.0'。
2. theme.ts 加常量 + getPopupFontScale。
3. TDD：tests/popup-font-scale.test.ts——常量值、'1.0'→'1'、'1.25'→'1.25' 精度、空/undefined→'1'、'abc'→'1'、'2'→'1.4'(超上限)、'0.1'→'0.85'(超下限)。
4. `npm test` 绿。

### 包2（PopupCard 应用 + SettingsView 滑块）
文件：`src/renderer/popup/PopupCard.tsx`、`src/renderer/manager/views/SettingsView.tsx`
1. PopupCard 加 fontScale state + zoom 应用。
2. SettingsView 加弹窗字体滑块 + 文案调整。
3. `npm run build` 过 + `npm test` 绿。

## 执行顺序与评审
1. 本 plan（✅）
2. 包1 子代理（TDD）→ reviewer → 修复
3. 包2 子代理 → reviewer → 修复
4. 主代理核查 diff
5. 最终 whole-branch 评审（opus）
6. progress.md 记录

## 真机验证点（用户做）
- 弹窗字体滑块拉大 → 下次弹窗字明显变大、**窗口尺寸不变**、间距不跟着狂胀
- 与界面大小滑块独立：调字体不动窗口、调窗口不动字体
- 拉到 1.4 背面例句展开不裁切（overflow-y-auto 兜底）
- 拉到 0.85 更紧凑
- 重启保持
