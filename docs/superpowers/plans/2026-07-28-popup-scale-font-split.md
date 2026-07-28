# 弹窗界面大小 + 字体大小双滑块实现计划

日期：2026-07-28
分支：feat/v1-popup-tray，BASE 7430348（icon SVG 完成）
背景：用户反馈现"界面缩放/字体大小"单滑块混在一起，要拆成两个独立滑块。用户决策：界面大小=**弹窗物理尺寸**；字体大小=**保持 rem 联动**（字+间距同比例，永远和谐）。

## 用户决策（已确认）
- **「界面大小」滑块**：调弹窗物理尺寸（width×height），主进程 resize + 重新锚定右下角。
- **「字体大小」滑块**：保持现状逻辑（改根 fontSize，rem 联动，字+布局同比例和谐）。
- 两个独立、互不干扰：界面管外壳多大、字体管内容多大。

## 设计取舍
- **新增设置** `popup_scale`（字符串数字，默认 '1.0'）。base 尺寸 360×240（popup.ts 现状）× scale = 实际。范围 0.8–1.5（0.8=288×192，1.5=540×360），step 0.05。
- **不新 IPC**：复用 settings:set——handler 里 `if (key === 'popup_scale') resizePopup(getPopup())`（仿 hotkey reregister 模式，ipc.ts 已有 getPopup 闭包）。
- **resize 逻辑** `resizePopup(win)`（popup.ts export）：读 popup_scale + screen workArea，算新 w/h，重算 x/y 锚右下角（workArea.right - w - 24），`win.setBounds({x,y,width,height})`。
- **createPopupWindow** 也读 popup_scale 算初始尺寸（启动即用用户设定）。
- **main/renderer 隔离**：popup.ts（main）内联解析 scale（parseFloat+clamp）；theme.ts（renderer）加 `getPopupScale` + POPUP_SCALE_MIN/MAX/DEFAULT 常量供 SettingsView 显示 + 可测。两处 clamp 范围同步（加注释互指）。

---

## 全局约束（精确值，子代理逐字遵守）

1. **settings.ts** DEFAULT_SETTINGS 加 `popup_scale: '1.0'`。旧用户无此键走默认（defaults 兜底，无需 migrate）。
2. **popup.ts**：
   - `createPopupWindow()`：base W=360 H=240，读 `getSetting('popup_scale')` → scale（clamp 0.8–1.5，非法→1）→ 实际 w=W*scale, h=H*scale；x/y 锚右下角（workArea.x+workAreaSize.width-w-24, ...-h-24）。
   - 新增 `resizePopup(win: BrowserWindow)`：同算 w/h/x/y → `win.setBounds({x,y,width,height})`。窗口销毁则 no-op。
   - scale 解析内联：`const scale = Math.min(1.5, Math.max(0.8, Number(getSetting('popup_scale')) || 1))`。
3. **ipc.ts** settings:set handler 加：`if (key === 'popup_scale') resizePopup(getPopup())`（getPopup 可能 null，resizePopup 内部判 win 销毁/no-op；getPopup 返回 BrowserWindow|null，resizePopup 接受 null 自判）。import resizePopup。
4. **theme.ts** 加：`POPUP_SCALE_MIN=0.8 / MAX=1.5 / DEFAULT=1.0` 常量 + `getPopupScale(value?): string`（解析 '1.2'→'1.2'，非法/空→'1.0'，clamp 范围，返回字符串数字）。注释标"与 popup.ts 内联解析同步"。
5. **SettingsView.tsx** 拆双滑块：
   - 现状「界面缩放/字体大小」单卡 → 拆成**两个 section（或一卡两滑块）**：
     - 「界面大小」滑块：min 0.8 max 1.5 step 0.05，value=parseFloat(settings.popup_scale||'1')，update('popup_scale', String(v))。标签显示百分比（如 120%）或倍数。说明"调弹窗物理尺寸"。
     - 「字体大小」滑块：保持现状（font_size 12–22px，rem 联动）。说明"字与布局同比例缩放"。
   - 两个滑块视觉独立、各自说明清楚。
6. **不动**：font_size 现有逻辑（getFontSize/App 应用根 fontSize）、scheduler/hotkey/audio/trash/vocab 结构、PopupCard 字号（刚调过的背面层级不动）。

---

## 包划分

### 包1 后端（popup resize + 设置 + 纯函数，TDD）
文件：`src/main/popup.ts`、`src/main/settings.ts`、`src/main/ipc.ts`、`src/renderer/theme.ts`（getPopupScale 纯函数+常量）、`tests/`

1. popup.ts：createPopupWindow 读 scale 算尺寸；resizePopup(win) 函数。
2. settings.ts：popup_scale 默认 '1.0'。
3. ipc.ts：settings:set 加 popup_scale→resizePopup。
4. theme.ts：POPUP_SCALE 常量 + getPopupScale 纯函数（renderer 显示/可测）。
5. TDD（tests/popup-scale.test.ts 或合并）：getPopupScale 解析/clamp/非法默认。
6. `npm test` 绿 + `npm run build` 过。

### 包2 前端（SettingsView 拆双滑块）
文件：`src/renderer/manager/views/SettingsView.tsx`

1. 拆「界面大小」+「字体大小」两滑块（独立 section 或一卡两滑块）。
2. 界面大小滑块用 theme.ts 的 POPUP_SCALE_MIN/MAX + getPopupScale；字体大小保持现状。
3. `npm run build` 过。

---

## 执行顺序与评审
1. 本 plan（✅）
2. **包1 后端子代理**（TDD）→ reviewer → 修复
3. **包2 前端子代理** → reviewer → 修复
4. 主代理核查 diff
5. **最终 whole-branch 评审（opus）**
6. progress.md 记录

## 真机验证点（用户做）
- 界面大小滑块调大/小 → 弹窗物理尺寸随之变（宽高都变），且始终贴右下角（不漂移）
- 字体大小滑块调 → 字+布局同比例变（rem 联动）
- 两个独立：调界面不影响字、调字不影响窗口尺寸
- 弹窗内容在最小/最大尺寸下不溢出/不裁切（背面 overflow-y-auto 兜底）
- 改界面大小后重启 App，尺寸保持（持久化）
