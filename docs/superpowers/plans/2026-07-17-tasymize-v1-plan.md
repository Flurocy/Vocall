# Tasymize V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 Tasymize V1——一个 Windows 桌面悬浮弹窗背词工具，按间隔重复在屏幕边角弹出"普通词→雅思高级表达"卡片，配合音效与"先问后答+三档自评"交互，含本地表达库管理与设置。

**Architecture:** Electron 主进程负责窗口管理、SRS 调度、electron-store(JSON) 数据层、托盘与音效；渲染进程（React+Tailwind）负责弹窗卡片 UI 与管理界面 UI；主↔渲染通过 contextBridge 暴露的 IPC 通信。弹窗窗口为 alwaysOnTop/frameless/transparent/skipTaskbar。

**Tech Stack:** TypeScript · Electron · React · Tailwind CSS · electron-store · electron-vite · Vitest

## Global Constraints

- 平台：Windows（开发机 win32）；路径处理需跨平台写法但目标 Windows。
- 语言：TypeScript，全程严格类型。
- Node 版本：v24（已确认可用）；包管理 npm。
- 存储：electron-store（JSON 键值存储，同步 API），数据文件自动放用户数据目录。按 key 分域：`expressions`(表达块数组)、`srsStates`(复习状态)、`settings`(设置)；V2 功能后续各加一个 key 即可。
- UI 原则：精美（毛玻璃/排版/间距），弹窗绝不强迫操作，超时自动消失。
- 内容：表达块 = `plain(普通词)` + `advanced(高级表达)` + `example(雅思例句)`，非孤立单词。
- 提交规范：每个 Task 结束 commit，信息用 `feat:`/`test:`/`chore:` 前缀。
- V2（截图翻译/句子升级/AI）本期**不实现**，仅在 settings 预留 AI 配置键。

---

### Task 0: 项目脚手架（electron-vite + TS + React + Tailwind）

**Files:**
- Create: `package.json`, `tsconfig.json`, `electron.vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `.gitignore`, `README.md`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/manager/index.html`

**Interfaces:**
- Produces: 可启动的 Electron 应用骨架；`npm run dev` 能打开一个窗口。

- [ ] **Step 1: 初始化 package.json 并安装依赖**

在 `Desktop/Tasymize/` 下执行：

```bash
npm init -y
npm install electron electron-vite react react-dom electron-store
npm install -D typescript @types/react @types/react-dom @types/node @vitejs/plugin-react vite tailwindcss postcss autoprefixer vitest
```

- [ ] **Step 2: 配置 electron-vite 主/预加载/渲染三端入口**

`electron.vite.config.ts`:

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: { outDir: 'out/main' },
    resolve: { alias: { '@main': resolve('src/main') } },
  },
  preload: {
    build: { outDir: 'out/preload' },
  },
  renderer: {
    root: 'src/renderer',
    build: { outDir: 'out/renderer' },
    plugins: [react()],
    resolve: { alias: { '@renderer': resolve('src/renderer') } },
  },
})
```

- [ ] **Step 3: 配置 package.json 脚本与入口**

```json
{
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: 最小主进程入口，先能弹出一个管理窗口**

`src/main/index.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createManagerWindow(): void {
  const win = new BrowserWindow({
    width: 960,
    height: 640,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL + '/manager/index.html')
  } else {
    win.loadFile(join(__dirname, '../renderer/manager/index.html'))
  }
}

app.whenReady().then(() => {
  createManagerWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createManagerWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts`:

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('tasymize', {
  // IPC 接口在后续任务中逐步挂载
})
```

`src/renderer/manager/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>Tasymize</title></head>
  <body>
    <div id="root">Tasymize 骨架启动成功</div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: 配置 Tailwind**

`tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

`postcss.config.js`:

```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

- [ ] **Step 6: 验证启动 & Commit**

```bash
npm run dev
# 预期：弹出 960x640 窗口，显示 "Tasymize 骨架启动成功"
git add -A
git commit -m "chore: electron-vite + TS + React + Tailwind 脚手架"
```

---

### Task 1: 数据层 — electron-store 表达块 CRUD

**说明：** 本任务已按 2026-07-21 决策从 SQLite(better-sqlite3) 重写为 electron-store(JSON) 方案。底层是 JSON 键值存储，但对外暴露的 CRUD 接口签名与原计划保持一致语义，便于后续任务（调度/设置/IPC）对接。

**Files:**
- Create: `src/main/store.ts`（封装 electron-store 实例与各域读写）
- Create: `src/main/expressions.ts`（表达块 CRUD）
- Test: `tests/expressions.test.ts`

**Interfaces:**
- Produces:
  - `addExpression(e: NewExpression): Expression`
  - `listExpressions(): Expression[]`
  - `updateExpression(id: number, patch: Partial<NewExpression>): void`
  - `deleteExpression(id: number): void`
  - 类型 `Expression = { id:number; plain:string; advanced:string; example:string; topic:string|null; source:string; created_at:number }`
  - 类型 `NewExpression = Omit<Expression, 'id'|'created_at'>`
  - 另：每条表达块创建时自动初始化其 SRS 状态 `srsStates[id] = { easiness:2.5, interval:0, repetitions:0, due_at:Date.now(), last_reviewed:null }`

**存储结构（electron-store 的 key）：**
```
expressions: Expression[]        // 表达块数组
srsStates: Record<number, SrsState>  // 以表达块 id 为键的复习状态
settings: Record<string, string> // 设置（Task 4 用）
nextId: number                   // 自增 id 计数器（JSON 无自增主键，需手动维护）
```

- [ ] **Step 1: 写失败测试**

`tests/expressions.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  addExpression, listExpressions, updateExpression, deleteExpression,
} from '../src/main/expressions'
import { _resetStoreForTests } from '../src/main/store'

describe('expressions CRUD (electron-store)', () => {
  beforeEach(() => {
    _resetStoreForTests() // 用内存态重置，避免测试间互相污染
  })

  it('adds and lists an expression, auto-increments id', () => {
    const a = addExpression({
      plain: 'important', advanced: 'plays a pivotal role in',
      example: 'Education plays a pivotal role in social mobility.',
      topic: '教育', source: '内置',
    })
    const b = addExpression({
      plain: 'good', advanced: 'remarkable',
      example: 'a remarkable improvement', topic: null, source: '内置',
    })
    expect(b.id).toBeGreaterThan(a.id)
    const all = listExpressions()
    expect(all).toHaveLength(2)
    expect(all[0].advanced).toBe('plays a pivotal role in')
  })

  it('initializes srs state on add', () => {
    const a = addExpression({
      plain: 'x', advanced: 'y', example: 'z', topic: null, source: '手动',
    })
    const { getSrsState } = require('../src/main/store')
    const s = getSrsState(a.id)
    expect(s).toBeTruthy()
    expect(s.easiness).toBe(2.5)
    expect(s.repetitions).toBe(0)
  })

  it('updates and deletes', () => {
    const a = addExpression({
      plain: 'a', advanced: 'b', example: 'c', topic: null, source: '手动',
    })
    updateExpression(a.id, { advanced: 'b2' })
    expect(listExpressions().find(e => e.id === a.id)!.advanced).toBe('b2')
    deleteExpression(a.id)
    expect(listExpressions()).toHaveLength(0)
    const { getSrsState } = require('../src/main/store')
    expect(getSrsState(a.id)).toBeUndefined() // 删除时联动清掉 srs 状态
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/expressions.test.ts
# 预期：FAIL，找不到 src/main/expressions 与 store
```

- [ ] **Step 3: 实现 store 封装与 CRUD**

`src/main/store.ts`（electron-store 单例 + 各域读写 + 测试重置钩子）：

```ts
import Store from 'electron-store'

export interface SrsState {
  easiness: number; interval: number; repetitions: number
  due_at: number; last_reviewed: number | null
}

interface Schema {
  expressions: import('./expressions').Expression[]
  srsStates: Record<number, SrsState>
  settings: Record<string, string>
  nextId: number
}

// 测试时注入内存实现；生产用 electron-store 持久化
let mem: Schema | null = null

const defaults: Schema = { expressions: [], srsStates: {}, settings: {}, nextId: 1 }
const store = new Store<Schema>({ defaults })

function read<K extends keyof Schema>(key: K): Schema[K] {
  return mem ? mem[key] : store.get(key)
}
function write<K extends keyof Schema>(key: K, val: Schema[K]): void {
  if (mem) { mem[key] = val } else { store.set(key, val) }
}

export function _resetStoreForTests(): void {
  mem = { expressions: [], srsStates: {}, settings: {}, nextId: 1 }
}

export function allocId(): number {
  const id = read('nextId')
  write('nextId', id + 1)
  return id
}

export function getSrsState(id: number): SrsState | undefined {
  return read('srsStates')[id]
}
export function setSrsState(id: number, s: SrsState): void {
  write('srsStates', { ...read('srsStates'), [id]: s })
}
export function deleteSrsState(id: number): void {
  const m = { ...read('srsStates') }
  delete m[id]
  write('srsStates', m)
}

export const expressionsBox = {
  get: () => read('expressions'),
  set: (v: Schema['expressions']) => write('expressions', v),
}
export const settingsBox = {
  get: () => read('settings'),
  set: (v: Schema['settings']) => write('settings', v),
}
```

`src/main/expressions.ts`（CRUD）：

```ts
import { allocId, expressionsBox, setSrsState, deleteSrsState } from './store'

export interface Expression {
  id: number; plain: string; advanced: string; example: string
  topic: string | null; source: string; created_at: number
}
export type NewExpression = Omit<Expression, 'id' | 'created_at'>

export function addExpression(e: NewExpression): Expression {
  const expr: Expression = { ...e, id: allocId(), created_at: Date.now() }
  expressionsBox.set([...expressionsBox.get(), expr])
  setSrsState(expr.id, {
    easiness: 2.5, interval: 0, repetitions: 0,
    due_at: Date.now(), last_reviewed: null,
  })
  return expr
}

export function listExpressions(): Expression[] {
  return [...expressionsBox.get()].sort((a, b) => a.id - b.id)
}

export function updateExpression(id: number, patch: Partial<NewExpression>): void {
  expressionsBox.set(
    expressionsBox.get().map(e => (e.id === id ? { ...e, ...patch } : e))
  )
}

export function deleteExpression(id: number): void {
  expressionsBox.set(expressionsBox.get().filter(e => e.id !== id))
  deleteSrsState(id)
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run tests/expressions.test.ts
# 预期：PASS（3 个用例全过）
```

- [ ] **Step 5: Commit**

```bash
git add tests/expressions.test.ts src/main/store.ts src/main/expressions.ts
git commit -m "feat: electron-store 数据层与表达块 CRUD"
```

---

### Task 2: SRS 调度算法（SM-2 变体，纯函数）

**Files:**
- Create: `src/main/srs.ts`
- Test: `tests/srs.test.ts`

**Interfaces:**
- Produces:
  - 类型 `Grade = 0 | 1 | 2`（0=忘了, 1=有点印象, 2=记得）
  - 类型 `SrsState = { easiness:number; interval:number; repetitions:number }`
  - `defaultState(): SrsState`
  - `review(state: SrsState, grade: Grade): SrsState`（纯函数，返回新 state，含下次间隔分钟数）

- [ ] **Step 1: 写失败测试**

`tests/srs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { defaultState, review } from '../src/main/srs'

describe('SM-2 变体', () => {
  it('忘了(0) 重置 repetitions 并给短间隔', () => {
    const s = { easiness: 2.5, interval: 100, repetitions: 5 }
    const next = review(s, 0)
    expect(next.repetitions).toBe(0)
    expect(next.interval).toBeLessThanOrEqual(10)
    expect(next.easiness).toBeLessThan(s.easiness)
  })

  it('记得(2) 增加 repetitions 并按 easiness 放大间隔', () => {
    const s = { easiness: 2.5, interval: 60, repetitions: 1 }
    const next = review(s, 2)
    expect(next.repetitions).toBe(2)
    expect(next.interval).toBeGreaterThan(60)
  })

  it('有点印象(1) 间隔小幅增长', () => {
    const s = { easiness: 2.5, interval: 60, repetitions: 1 }
    const next = review(s, 1)
    expect(next.interval).toBeGreaterThan(60)
    expect(next.interval).toBeLessThan(60 * 2)
  })

  it('easiness 不低于下限 1.3', () => {
    let s = defaultState()
    for (let i = 0; i < 20; i++) s = review(s, 0)
    expect(s.easiness).toBeGreaterThanOrEqual(1.3)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/srs.test.ts
# 预期：FAIL，找不到 srs.ts
```

- [ ] **Step 3: 实现算法**

`src/main/srs.ts`:

```ts
export type Grade = 0 | 1 | 2

export interface SrsState {
  easiness: number
  interval: number // 分钟
  repetitions: number
}

export function defaultState(): SrsState {
  return { easiness: 2.5, interval: 0, repetitions: 0 }
}

const MIN_EASINESS = 1.3

export function review(state: SrsState, grade: Grade): SrsState {
  let { easiness, interval, repetitions } = state

  if (grade === 0) {
    repetitions = 0
    interval = 10
    easiness = Math.max(MIN_EASINESS, easiness - 0.2)
  } else if (grade === 1) {
    repetitions += 1
    interval = interval <= 0 ? 30 : interval * 1.2
    easiness = Math.max(MIN_EASINESS, easiness - 0.05)
  } else {
    repetitions += 1
    if (repetitions === 1) interval = 60
    else if (repetitions === 2) interval = 360
    else interval = interval * easiness
    easiness = Math.min(3.0, easiness + 0.05)
  }

  return { easiness, interval, repetitions }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run tests/srs.test.ts
# 预期：PASS
```

- [ ] **Step 5: Commit**

```bash
git add tests/srs.test.ts src/main/srs.ts
git commit -m "feat: SM-2 变体 SRS 调度算法"
```

---

### Task 3: 调度器 — 到期查询与评分回写

**Files:**
- Create: `src/main/scheduler.ts`
- Test: `tests/scheduler.test.ts`

**Interfaces:**
- Consumes: `listExpressions`（Task 1），`getSrsState/setSrsState`（Task 1 store），`review/Grade/SrsState`（Task 2）
- Produces:
  - `getDueExpression(now: number): Expression | null`
  - `applyReview(exprId: number, grade: Grade, now: number): void`

- [ ] **Step 1: 写失败测试**

`tests/scheduler.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests } from '../src/main/store'
import { addExpression } from '../src/main/expressions'
import { getDueExpression, applyReview } from '../src/main/scheduler'

describe('调度器', () => {
  beforeEach(() => {
    _resetStoreForTests() // 内存态重置，避免测试间互相污染
  })

  it('到期则返回该表达块', () => {
    const expr = addExpression({
      plain: 'p', advanced: 'a', example: 'e', topic: null, source: '内置',
    })
    const due = getDueExpression(Date.now())
    expect(due).not.toBeNull()
    expect(due!.id).toBe(expr.id)
  })

  it('评分"记得"后短时间内不再到期', () => {
    const expr = addExpression({
      plain: 'p', advanced: 'a', example: 'e', topic: null, source: '内置',
    })
    applyReview(expr.id, 2, Date.now())
    expect(getDueExpression(Date.now())).toBeNull()
  })

  it('评分"忘了"后很快再次到期', () => {
    const expr = addExpression({
      plain: 'p', advanced: 'a', example: 'e', topic: null, source: '内置',
    })
    applyReview(expr.id, 2, Date.now())
    applyReview(expr.id, 0, Date.now())
    // 10 分钟内到期 → 用 11 分钟后的时间戳判定
    expect(getDueExpression(Date.now() + 11 * 60 * 1000)).not.toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/scheduler.test.ts
# 预期：FAIL，找不到 scheduler.ts
```

- [ ] **Step 3: 实现调度器**

`src/main/scheduler.ts`:

```ts
import type { Expression } from './expressions'
import { listExpressions } from './expressions'
import { getSrsState, setSrsState } from './store'
import { review, type Grade, type SrsState } from './srs'

// 到期查询：遍历全部表达块，用 getSrsState(id) 取复习状态，筛 due_at <= now 中最早到期的一条。
// 注意：不要直接遍历 store 里的 srsStates 域——JSON 序列化后其键是字符串，
// 若必须遍历需 Number(key) 转回数字 id；这里改为以 expressions 数组为主遍历，天然避开该坑。
export function getDueExpression(now: number): Expression | null {
  let best: Expression | null = null
  let bestDue = Infinity
  for (const e of listExpressions()) {
    const s = getSrsState(e.id)
    if (!s) continue
    if (s.due_at <= now && s.due_at < bestDue) {
      best = e
      bestDue = s.due_at
    }
  }
  return best
}

// 评分回写：读出现状 → 纯函数 review 计算 → setSrsState 整体写回（含 due_at / last_reviewed）
export function applyReview(exprId: number, grade: Grade, now: number): void {
  const cur = getSrsState(exprId)
  const base: SrsState = cur
    ? { easiness: cur.easiness, interval: cur.interval, repetitions: cur.repetitions }
    : { easiness: 2.5, interval: 0, repetitions: 0 }
  const next = review(base, grade)
  const dueAt = now + Math.round(next.interval * 60 * 1000)
  setSrsState(exprId, {
    easiness: next.easiness,
    interval: next.interval,
    repetitions: next.repetitions,
    due_at: dueAt,
    last_reviewed: now,
  })
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run tests/scheduler.test.ts
# 预期：PASS
```

- [ ] **Step 5: Commit**

```bash
git add tests/scheduler.test.ts src/main/scheduler.ts
git commit -m "feat: 到期查询与评分回写调度器"
```

---

### Task 4: 设置读写与默认值

**Files:**
- Create: `src/main/settings.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Consumes: `settingsBox`（Task 1 store）
- Produces:
  - `getSetting(key: string): string | null`
  - `setSetting(key: string, value: string): void`
  - `getAllSettings(): Record<string, string>`
  - `DEFAULT_SETTINGS: Record<string, string>`（含 popup_interval_min、popup_stay_sec、recall_delay_sec、popup_position、sound_enabled、sound_volume、sound_file、daily_cap、ai_provider、ai_api_key、ai_base_url、ai_model）

- [ ] **Step 1: 写失败测试**

`tests/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests } from '../src/main/store'
import { getSetting, setSetting, getAllSettings, DEFAULT_SETTINGS } from '../src/main/settings'

describe('settings', () => {
  beforeEach(() => {
    _resetStoreForTests()
  })

  it('未设置时返回默认值', () => {
    expect(getSetting('popup_interval_min')).toBe(DEFAULT_SETTINGS.popup_interval_min)
  })

  it('写入后可读取，且覆盖默认值', () => {
    setSetting('popup_interval_min', '10')
    expect(getSetting('popup_interval_min')).toBe('10')
  })

  it('getAllSettings 合并默认值与已存值', () => {
    setSetting('sound_enabled', 'false')
    const all = getAllSettings()
    expect(all.sound_enabled).toBe('false')
    expect(all.popup_position).toBe(DEFAULT_SETTINGS.popup_position)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/settings.test.ts
# 预期：FAIL，找不到 settings.ts
```

- [ ] **Step 3: 实现设置层**

`src/main/settings.ts`:

```ts
import { settingsBox } from './store'

export const DEFAULT_SETTINGS: Record<string, string> = {
  popup_interval_min: '8',
  popup_stay_sec: '8',
  recall_delay_sec: '3',
  popup_position: 'bottom-right',
  sound_enabled: 'true',
  sound_volume: '0.6',
  sound_file: '',
  daily_cap: '60',
  ai_provider: 'deepseek',
  ai_api_key: '',
  ai_base_url: '',
  ai_model: '',
}

export function getSetting(key: string): string | null {
  return settingsBox.get()[key] ?? DEFAULT_SETTINGS[key] ?? null
}

export function setSetting(key: string, value: string): void {
  settingsBox.set({ ...settingsBox.get(), [key]: value })
}

export function getAllSettings(): Record<string, string> {
  return { ...DEFAULT_SETTINGS, ...settingsBox.get() }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run tests/settings.test.ts
# 预期：PASS
```

- [ ] **Step 5: Commit**

```bash
git add tests/settings.test.ts src/main/settings.ts
git commit -m "feat: 设置读写与默认值（含 V2 AI 配置预留）"
```

---

### Task 5: IPC 桥 — 主进程向渲染暴露数据与设置接口

**Files:**
- Create: `src/main/ipc.ts`
- Modify: `src/main/index.ts`（注册 ipc）
- Modify: `src/preload/index.ts`（contextBridge 暴露）
- Create: `src/shared/ipc-types.ts`

**Interfaces:**
- Produces（渲染端可调用的 `window.tasymize`）:
  - `listExpressions(): Promise<Expression[]>`
  - `addExpression(e: NewExpression): Promise<number>`
  - `updateExpression(id: number, patch: Partial<NewExpression>): Promise<void>`
  - `deleteExpression(id: number): Promise<void>`
  - `getSettings(): Promise<Record<string, string>>`
  - `setSetting(key: string, value: string): Promise<void>`

- [ ] **Step 1: 定义共享类型与 window.tasymize 全局声明**

`src/shared/ipc-types.ts`:

```ts
export interface Expression {
  id: number; plain: string; advanced: string; example: string
  topic: string | null; source: string; created_at: number
}
export type NewExpression = Omit<Expression, 'id' | 'created_at'>

// 渲染端可调用的接口形状
export interface TasymizeApi {
  listExpressions(): Promise<Expression[]>
  addExpression(e: NewExpression): Promise<number>
  updateExpression(id: number, patch: Partial<NewExpression>): Promise<void>
  deleteExpression(id: number): Promise<void>
  getSettings(): Promise<Record<string, string>>
  setSetting(key: string, value: string): Promise<void>
  onShow(cb: (expr: Expression) => void): void
  grade(id: number, grade: 0 | 1 | 2): Promise<void>
  dismiss(): void
}

declare global {
  interface Window {
    tasymize: TasymizeApi
  }
}
```

> 说明：`expressions.ts` 中的 `Expression`/`NewExpression` 后续改为从 `src/shared/ipc-types.ts` 导入并 re-export，避免重复定义（Task 1 已定义的本地接口保留即可，渲染端统一用 shared 里的）。

- [ ] **Step 2: 主进程注册 handler**

`src/main/ipc.ts`:

```ts
import { ipcMain } from 'electron'
import {
  addExpression, deleteExpression, listExpressions, updateExpression,
  type NewExpression,
} from './expressions'
import { getAllSettings, setSetting } from './settings'

export function registerIpc(): void {
  ipcMain.handle('expr:list', () => listExpressions())
  ipcMain.handle('expr:add', (_e, expr: NewExpression) => addExpression(expr).id)
  ipcMain.handle('expr:update', (_e, id: number, patch: Partial<NewExpression>) =>
    updateExpression(id, patch))
  ipcMain.handle('expr:delete', (_e, id: number) => deleteExpression(id))
  ipcMain.handle('settings:getAll', () => getAllSettings())
  ipcMain.handle('settings:set', (_e, key: string, value: string) =>
    setSetting(key, value))
}
```

- [ ] **Step 3: preload 通过 contextBridge 暴露**

`src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { NewExpression } from '../shared/ipc-types'

contextBridge.exposeInMainWorld('tasymize', {
  listExpressions: () => ipcRenderer.invoke('expr:list'),
  addExpression: (e: NewExpression) => ipcRenderer.invoke('expr:add', e),
  updateExpression: (id: number, patch: Partial<NewExpression>) =>
    ipcRenderer.invoke('expr:update', id, patch),
  deleteExpression: (id: number) => ipcRenderer.invoke('expr:delete', id),
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key: string, value: string) =>
    ipcRenderer.invoke('settings:set', key, value),
})
```

- [ ] **Step 4: 主入口注册 IPC 并创建管理窗口**

`src/main/index.ts`（在 `app.whenReady` 中；electron-store 在 `store.ts` 模块加载时自动初始化，无需显式打开/建表）:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'

function createManagerWindow(): void {
  const win = new BrowserWindow({
    width: 960, height: 640,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL + '/manager/index.html')
  } else {
    win.loadFile(join(__dirname, '../renderer/manager/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  createManagerWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createManagerWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 5: 验证 & Commit**

```bash
npm run dev
# 预期：窗口正常启动，无 IPC 报错
git add src/main/ipc.ts src/main/index.ts src/preload/index.ts src/shared/ipc-types.ts
git commit -m "feat: IPC 桥接表达块与设置接口"
```

---

### Task 6: 弹窗窗口与调度循环（主进程）

**Files:**
- Create: `src/main/popup.ts`
- Create: `src/main/engine.ts`
- Modify: `src/main/index.ts`（启动调度循环）

**Interfaces:**
- Consumes: `getDueExpression`（Task 3），`getSetting`（Task 4）
- Produces:
  - `showPopup(win: BrowserWindow, expr: Expression): void`（向弹窗发送数据）
  - `startEngine(getPopup: () => BrowserWindow): void`（按 popup_interval_min 轮询到期并弹出）

- [ ] **Step 1: 弹窗窗口创建（frameless/透明/置顶/不抢焦点）**

`src/main/popup.ts`:

```ts
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type { Expression } from './expressions'

export function createPopupWindow(): BrowserWindow {
  const { workAreaSize, workArea } = screen.getPrimaryDisplay()
  const width = 360
  const height = 200
  const x = workArea.x + workAreaSize.width - width - 24
  const y = workArea.y + workAreaSize.height - height - 24

  const win = new BrowserWindow({
    width, height, x, y,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, focusable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL + '/popup/popup.html')
  } else {
    win.loadFile(join(__dirname, '../renderer/popup/popup.html'))
  }
  return win
}

export function showPopup(win: BrowserWindow, expr: Expression): void {
  win.webContents.send('popup:show', expr)
  win.showInactive()
}

export function hidePopup(win: BrowserWindow): void {
  win.hide()
}
```

- [ ] **Step 2: 调度引擎**

`src/main/engine.ts`:

```ts
import type { BrowserWindow } from 'electron'
import { getDueExpression } from './scheduler'
import { getSetting } from './settings'
import { showPopup } from './popup'

export function startEngine(getPopup: () => BrowserWindow): void {
  const tick = (): void => {
    const now = Date.now()
    const due = getDueExpression(now)
    if (due) {
      showPopup(getPopup(), due)
      // 弹出后给一个兜底间隔，避免同一条连续弹
      const minGapMs = Number(getSetting('popup_interval_min')) * 60 * 1000
      setTimeout(tick, minGapMs)
      return
    }
    setTimeout(tick, 15 * 1000) // 无到期则 15s 后再查
  }
  tick()
}
```

- [ ] **Step 3: 主入口接入弹窗与引擎**

`src/main/index.ts` 在 `app.whenReady` 内追加：

```ts
import { createPopupWindow } from './popup'
import { startEngine } from './engine'
// ...whenReady 内：
  const popup = createPopupWindow()
  startEngine(() => popup)
```

- [ ] **Step 4: 验证 & Commit**

```bash
npm run dev
# 预期：主窗口正常；到点右下角出现弹窗（内容待 Task 7 渲染）
git add src/main/popup.ts src/main/engine.ts src/main/index.ts
git commit -m "feat: 弹窗窗口与 SRS 调度循环"
```

---

### Task 7: 弹窗卡片 UI（React，先问后答 + 三档自评 + 音效）

**Files:**
- Create: `src/renderer/popup/popup.html`, `src/renderer/popup/main.tsx`, `src/renderer/popup/PopupCard.tsx`, `src/renderer/popup/popup.css`
- Modify: `src/preload/index.ts`（暴露 `onShow`、`grade`）

**Interfaces:**
- Consumes: 主进程 `popup:show` 推送的 `Expression`
- Produces（弹窗端 `window.tasymize` 增补）:
  - `onShow(cb: (expr: Expression) => void): void`
  - `grade(id: number, grade: 0|1|2): Promise<void>`
  - `dismiss(): void`

- [ ] **Step 1: preload 增补弹窗接口**

`src/preload/index.ts` 追加：

```ts
  onShow: (cb: (expr: unknown) => void) =>
    ipcRenderer.on('popup:show', (_e, expr) => cb(expr)),
  grade: (id: number, grade: 0 | 1 | 2) =>
    ipcRenderer.invoke('popup:grade', id, grade),
  dismiss: () => ipcRenderer.invoke('popup:dismiss'),
```

- [ ] **Step 2: 主进程处理评分与关闭**

`src/main/ipc.ts` 追加 handler：

```ts
import { applyReview } from './scheduler'
// registerIpc 内追加：
  ipcMain.handle('popup:grade', (_e, id: number, grade: 0 | 1 | 2) => {
    applyReview(id, grade, Date.now())
  })
```

`src/main/popup.ts` 追加：

```ts
import { ipcMain } from 'electron'
export function registerPopupIpc(getPopup: () => BrowserWindow): void {
  ipcMain.handle('popup:dismiss', () => hidePopup(getPopup()))
}
```

并在 `src/main/index.ts` 调用 `registerPopupIpc(() => popup)`。

- [ ] **Step 3: 卡片组件（先普通词→延时翻高级表达→自评，超时自动消失）**

`src/renderer/popup/PopupCard.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Expression } from '../../shared/ipc-types'

export default function PopupCard(): JSX.Element {
  const [expr, setExpr] = useState<Expression | null>(null)
  const [revealed, setRevealed] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    window.tasymize.onShow((e: Expression) => {
      timers.current.forEach(clearTimeout)
      timers.current = []
      setExpr(e)
      setRevealed(false)
      const recallMs = Number(/* recall_delay_sec 默认 3 */ 3) * 1000
      const stayMs = Number(/* popup_stay_sec 默认 8 */ 8) * 1000
      timers.current.push(window.setTimeout(() => setRevealed(true), recallMs))
      timers.current.push(window.setTimeout(() => window.tasymize.dismiss(), recallMs + stayMs))
      // 音效
      const audio = new Audio('assets/pop.mp3')
      audio.volume = 0.6
      void audio.play().catch(() => {})
    })
    return () => timers.current.forEach(clearTimeout)
  }, [])

  if (!expr) return null

  const send = (g: 0 | 1 | 2): void => {
    void window.tasymize.grade(expr.id, g)
    window.tasymize.dismiss()
  }

  return (
    <div className="m-0 flex h-full w-full items-center justify-center bg-transparent">
      <div className="w-full rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-md">
        <div className="text-sm text-slate-400">{expr.plain}</div>
        {revealed ? (
          <>
            <div className="mt-1 text-xl font-semibold text-emerald-300">{expr.advanced}</div>
            <div className="mt-2 text-xs leading-relaxed text-slate-300">{expr.example}</div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => send(0)} className="flex-1 rounded-lg bg-rose-500/20 py-1.5 text-sm text-rose-300 hover:bg-rose-500/30">😵 忘了</button>
              <button onClick={() => send(1)} className="flex-1 rounded-lg bg-amber-500/20 py-1.5 text-sm text-amber-300 hover:bg-amber-500/30">🤔 有点印象</button>
              <button onClick={() => send(2)} className="flex-1 rounded-lg bg-emerald-500/20 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/30">😎 记得</button>
            </div>
          </>
        ) : (
          <div className="mt-1 text-xl font-semibold text-slate-500">… 回想一下高级表达 …</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 入口与样式**

`src/renderer/popup/popup.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>popup</title></head>
  <body style="background:transparent">
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/renderer/popup/main.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import PopupCard from './PopupCard'
import './popup.css'

createRoot(document.getElementById('root')!).render(<PopupCard />)
```

`src/renderer/popup/popup.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; background: transparent; }
```

- [ ] **Step 5: 验证 & Commit**

```bash
npm run dev
# 预期：到点右下角弹出毛玻璃卡片，先显示普通词，3s 后翻高级表达与三按钮；
#       点击按钮后消失；不点则约 11s 后自动消失；有音效。
git add src/renderer/popup src/preload/index.ts src/main/popup.ts src/main/ipc.ts src/main/index.ts
git commit -m "feat: 弹窗卡片 UI（先问后答+三档自评+音效+自动消失）"
```

---

### Task 8: 管理界面 UI（表达库 CRUD + 设置面板）

**Files:**
- Create: `src/renderer/manager/main.tsx`, `src/renderer/manager/App.tsx`, `src/renderer/manager/views/ExpressionsView.tsx`, `src/renderer/manager/views/SettingsView.tsx`, `src/renderer/manager/app.css`

**Interfaces:**
- Consumes: `window.tasymize`（Task 5 的全部接口）

- [ ] **Step 1: 入口与全局样式**

`src/renderer/manager/main.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './app.css'

createRoot(document.getElementById('root')!).render(<App />)
```

`src/renderer/manager/app.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2: App 骨架（左导航右内容）**

`src/renderer/manager/App.tsx`:

```tsx
import { useState } from 'react'
import ExpressionsView from './views/ExpressionsView'
import SettingsView from './views/SettingsView'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<'expr' | 'settings'>('expr')
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <nav className="w-44 border-r border-white/10 p-4">
        <h1 className="mb-6 text-lg font-bold text-emerald-300">Tasymize</h1>
        <button onClick={() => setTab('expr')} className={`mb-2 block w-full rounded-lg px-3 py-2 text-left text-sm ${tab === 'expr' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-white/5'}`}>表达库</button>
        <button onClick={() => setTab('settings')} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${tab === 'settings' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-white/5'}`}>设置</button>
      </nav>
      <main className="flex-1 overflow-auto p-6">
        {tab === 'expr' ? <ExpressionsView /> : <SettingsView />}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: 表达库视图（列表 + 新增 + 删除）**

`src/renderer/manager/views/ExpressionsView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Expression } from '../../../shared/ipc-types'

export default function ExpressionsView(): JSX.Element {
  const [list, setList] = useState<Expression[]>([])
  const [plain, setPlain] = useState('')
  const [advanced, setAdvanced] = useState('')
  const [example, setExample] = useState('')

  const reload = async (): Promise<void> => {
    setList(await window.tasymize.listExpressions())
  }
  useEffect(() => { void reload() }, [])

  const add = async (): Promise<void> => {
    if (!plain || !advanced) return
    await window.tasymize.addExpression({ plain, advanced, example, topic: null, source: '手动' })
    setPlain(''); setAdvanced(''); setExample('')
    await reload()
  }

  const remove = async (id: number): Promise<void> => {
    await window.tasymize.deleteExpression(id)
    await reload()
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">表达库（{list.length}）</h2>
      <div className="mb-6 grid grid-cols-3 gap-2">
        <input value={plain} onChange={(e) => setPlain(e.target.value)} placeholder="普通词 important" className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none" />
        <input value={advanced} onChange={(e) => setAdvanced(e.target.value)} placeholder="高级表达 plays a pivotal role in" className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none" />
        <input value={example} onChange={(e) => setExample(e.target.value)} placeholder="雅思例句（可选）" className="rounded-lg bg-white/5 px-3 py-2 text-sm outline-none" />
      </div>
      <button onClick={() => void add()} className="mb-6 rounded-lg bg-emerald-500/80 px-4 py-2 text-sm font-medium hover:bg-emerald-500">新增表达</button>
      <ul className="space-y-2">
        {list.map((e) => (
          <li key={e.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <span className="text-slate-400">{e.plain}</span>
              <span className="mx-2 text-slate-600">→</span>
              <span className="text-emerald-300">{e.advanced}</span>
            </div>
            <button onClick={() => void remove(e.id)} className="text-xs text-rose-400 hover:text-rose-300">删除</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: 设置视图**

`src/renderer/manager/views/SettingsView.tsx`:

```tsx
import { useEffect, useState } from 'react'

const FIELDS: { key: string; label: string }[] = [
  { key: 'popup_interval_min', label: '弹出间隔（分钟）' },
  { key: 'popup_stay_sec', label: '停留时长（秒）' },
  { key: 'recall_delay_sec', label: '回想时长（秒）' },
  { key: 'sound_enabled', label: '音效开关（true/false）' },
  { key: 'sound_volume', label: '音量（0-1）' },
  { key: 'daily_cap', label: '每日弹出上限' },
]

export default function SettingsView(): JSX.Element {
  const [settings, setSettings] = useState<Record<string, string>>({})

  useEffect(() => {
    void window.tasymize.getSettings().then(setSettings)
  }, [])

  const update = async (key: string, value: string): Promise<void> => {
    await window.tasymize.setSetting(key, value)
    setSettings((s) => ({ ...s, [key]: value }))
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">设置</h2>
      <div className="max-w-md space-y-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-sm text-slate-400">{f.label}</span>
            <input
              value={settings[f.key] ?? ''}
              onChange={(e) => void update(f.key, e.target.value)}
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 验证 & Commit**

```bash
npm run dev
# 预期：主窗口可切换"表达库/设置"；新增表达立即出现在列表并参与调度；
#       设置改动即时保存。
git add src/renderer/manager
git commit -m "feat: 管理界面（表达库 CRUD + 设置面板）"
```

---

### Task 9: 内置初始表达块数据 + 首次启动导入

**Files:**
- Create: `data/seed-expressions.json`
- Create: `src/main/seed.ts`
- Modify: `src/main/index.ts`（首次启动若无数据则导入）
- Test: `tests/seed.test.ts`

**Interfaces:**
- Consumes: `addExpression/listExpressions`（Task 1）
- Produces: `seedIfEmpty(): number`（返回导入条数；已有数据则 0）

- [ ] **Step 1: 写失败测试**

`tests/seed.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { _resetStoreForTests } from '../src/main/store'
import { seedIfEmpty } from '../src/main/seed'
import { listExpressions } from '../src/main/expressions'

describe('seed', () => {
  beforeEach(() => {
    _resetStoreForTests()
  })

  it('空库导入一批内置表达块', () => {
    const n = seedIfEmpty()
    expect(n).toBeGreaterThan(0)
    expect(listExpressions().length).toBe(n)
  })

  it('非空库不重复导入', () => {
    seedIfEmpty()
    expect(seedIfEmpty()).toBe(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/seed.test.ts
# 预期：FAIL，找不到 seed.ts
```

- [ ] **Step 3: 内置数据与导入逻辑**

`data/seed-expressions.json`（示例 12 条，可后续扩充）:

```json
[
  { "plain": "important", "advanced": "plays a pivotal role in", "example": "Education plays a pivotal role in social mobility.", "topic": "教育" },
  { "plain": "more and more", "advanced": "an increasing number of", "example": "An increasing number of people work from home.", "topic": "社会" },
  { "plain": "very good", "advanced": "remarkably effective", "example": "Online courses are remarkably effective for self-study.", "topic": "科技" },
  { "plain": "bad", "advanced": "detrimental to", "example": "Air pollution is detrimental to public health.", "topic": "环境" },
  { "plain": "help", "advanced": "facilitate", "example": "Technology facilitates access to information.", "topic": "科技" },
  { "plain": "think", "advanced": "hold the view that", "example": "I hold the view that governments should invest in public transport.", "topic": "观点" },
  { "plain": "cause", "advanced": "give rise to", "example": "Urbanisation gives rise to housing shortages.", "topic": "社会" },
  { "plain": "need", "advanced": "there is a pressing need for", "example": "There is a pressing need for renewable energy.", "topic": "环境" },
  { "plain": "many", "advanced": "a substantial proportion of", "example": "A substantial proportion of students study abroad.", "topic": "教育" },
  { "plain": "improve", "advanced": "enhance", "example": "Reading enhances critical thinking skills.", "topic": "教育" },
  { "plain": "solve", "advanced": "address / tackle", "example": "We must address climate change urgently.", "topic": "环境" },
  { "plain": "because", "advanced": "owing to / on account of", "example": "The event was cancelled owing to bad weather.", "topic": "连接" }
]
```

`src/main/seed.ts`:

```ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { addExpression, listExpressions } from './expressions'

interface SeedItem { plain: string; advanced: string; example: string; topic: string }

export function seedIfEmpty(seedPath?: string): number {
  if (listExpressions().length > 0) return 0
  const file = seedPath ?? join(__dirname, '../../data/seed-expressions.json')
  const items = JSON.parse(readFileSync(file, 'utf-8')) as SeedItem[]
  for (const it of items) {
    // addExpression 内部会自增 id 并自动初始化该条的 SRS 状态
    addExpression({ ...it, source: '内置' })
  }
  return items.length
}
```

> 注：测试环境用相对路径读取 `data/seed-expressions.json`；`__dirname` 在 vitest 下指向源码目录，需用 `process.cwd()` 兜底——见 Step 4 调整。

- [ ] **Step 4: 兼容测试路径并跑通**

将 `seed.ts` 的路径解析改为：

```ts
  const file =
    seedPath ??
    join(process.cwd(), 'data', 'seed-expressions.json')
```

运行：

```bash
npx vitest run tests/seed.test.ts
# 预期：PASS
```

- [ ] **Step 5: 主入口接入 & Commit**

`src/main/index.ts` 在 `app.whenReady` 内、`registerIpc()` 之前追加：

```ts
import { seedIfEmpty } from './seed'
// ...
  seedIfEmpty()
```

```bash
npm run dev
# 预期：管理界面"表达库"显示 12 条内置表达
git add data/seed-expressions.json src/main/seed.ts tests/seed.test.ts src/main/index.ts
git commit -m "feat: 内置初始表达块与首次启动导入"
```

---

### Task 10: 托盘 + 开机自启 + 收尾打磨

**Files:**
- Modify: `src/main/index.ts`
- Create: `assets/sounds/pop.mp3`（占位，用户后续替换）

**Interfaces:**
- Produces: 系统托盘图标，右键菜单"打开管理 / 暂停弹出 / 退出"；可选开机自启。

- [ ] **Step 1: 托盘与菜单**

`src/main/index.ts` 追加：

```ts
import { Tray, Menu, nativeImage } from 'electron'
// whenReady 内：
  const tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('Tasymize')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开管理', click: () => createManagerWindow() },
    { label: '退出', click: () => app.quit() },
  ]))
```

> 说明：`nativeImage.createEmpty()` 为占位图标，正式图标后续放入 `assets/icon.png` 并替换。

- [ ] **Step 2: 主窗口关闭时最小化到托盘而非退出（背词工具常驻）**

将 `window-all-closed` 处理改为不退出：

```ts
app.on('window-all-closed', () => {
  // 常驻后台，靠托盘退出；如需退出用托盘"退出"
})
```

- [ ] **Step 3: 验证 & Commit**

```bash
npm run dev
# 预期：关闭主窗口后进程仍在，托盘可见，可右键退出；弹窗仍按调度出现。
git add src/main/index.ts assets
git commit -m "feat: 系统托盘与后台常驻"
```

---

## 验收清单（V1 完成标准）

- [ ] `npm run dev` 启动后管理界面正常、表达库含 12 条内置表达
- [ ] 到点右下角弹出毛玻璃卡片，先普通词后高级表达，有音效
- [ ] 点击 😵/🤔/😎 能按 SM-2 改变下次弹出时间；不点则超时自动消失
- [ ] 新增/删除表达块立即参与调度
- [ ] 设置（间隔/时长/音量/开关）改动即时生效
- [ ] 关闭窗口常驻托盘，可右键退出
- [ ] `npm test` 全部单元测试通过
