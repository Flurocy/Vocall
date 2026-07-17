# Tasymize V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 Tasymize V1——一个 Windows 桌面悬浮弹窗背词工具，按间隔重复在屏幕边角弹出"普通词→雅思高级表达"卡片，配合音效与"先问后答+三档自评"交互，含本地表达库管理与设置。

**Architecture:** Electron 主进程负责窗口管理、SRS 调度、SQLite 数据层、托盘与音效；渲染进程（React+Tailwind）负责弹窗卡片 UI 与管理界面 UI；主↔渲染通过 contextBridge 暴露的 IPC 通信。弹窗窗口为 alwaysOnTop/frameless/transparent/skipTaskbar。

**Tech Stack:** TypeScript · Electron · React · Tailwind CSS · better-sqlite3 · electron-vite · Vitest

## Global Constraints

- 平台：Windows（开发机 win32）；路径处理需跨平台写法但目标 Windows。
- 语言：TypeScript，全程严格类型。
- Node 版本：v24（已确认可用）；包管理 npm。
- 存储：SQLite（`better-sqlite3`，同步 API），数据库文件放用户数据目录。
- UI 原则：精美（毛玻璃/排版/间距），弹窗绝不强迫操作，超时自动消失。
- 内容：表达块 = `plain(普通词)` + `advanced(高级表达)` + `example(雅思例句)`，非孤立单词。
- 提交规范：每个 Task 结束 commit，信息用 `feat:`/`test:`/`chore:` 前缀。
- V2（截图翻译/句子升级/AI）本期**不实现**，仅在 settings 表预留 AI 配置键。

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
npm install electron electron-vite react react-dom better-sqlite3
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

### Task 1: 数据层 — SQLite 建表与表达块 CRUD

**Files:**
- Create: `src/main/db.ts`
- Create: `src/main/schema.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces:
  - `initDb(dbPath: string): Database`
  - `addExpression(db, e: NewExpression): number`
  - `listExpressions(db): Expression[]`
  - `updateExpression(db, id: number, patch: Partial<NewExpression>): void`
  - `deleteExpression(db, id: number): void`
  - 类型 `Expression = { id:number; plain:string; advanced:string; example:string; topic:string|null; source:string; created_at:number }`
  - 类型 `NewExpression = Omit<Expression, 'id'|'created_at'>`

- [ ] **Step 1: 写失败测试**

`tests/db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import initSqlJs from 'better-sqlite3'
import { createSchema } from '../src/main/schema'
import {
  addExpression, listExpressions, updateExpression, deleteExpression,
} from '../src/main/db'

describe('expressions CRUD', () => {
  let db: any
  beforeEach(() => {
    db = new initSqlJs(':memory:')
    createSchema(db)
  })

  it('adds and lists an expression', () => {
    const id = addExpression(db, {
      plain: 'important', advanced: 'plays a pivotal role in',
      example: 'Education plays a pivotal role in social mobility.',
      topic: '教育', source: '内置',
    })
    const all = listExpressions(db)
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(id)
    expect(all[0].advanced).toBe('plays a pivotal role in')
  })

  it('updates and deletes', () => {
    const id = addExpression(db, {
      plain: 'a', advanced: 'b', example: 'c', topic: null, source: '手动',
    })
    updateExpression(db, id, { advanced: 'b2' })
    expect(listExpressions(db)[0].advanced).toBe('b2')
    deleteExpression(db, id)
    expect(listExpressions(db)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run tests/db.test.ts
# 预期：FAIL，找不到 src/main/db 与 schema
```

- [ ] **Step 3: 实现 schema 与 CRUD**

`src/main/schema.ts`:

```ts
import type { Database } from 'better-sqlite3'

export function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expressions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plain TEXT NOT NULL,
      advanced TEXT NOT NULL,
      example TEXT NOT NULL,
      topic TEXT,
      source TEXT NOT NULL DEFAULT '内置',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS srs_state (
      expr_id INTEGER PRIMARY KEY REFERENCES expressions(id) ON DELETE CASCADE,
      easiness REAL NOT NULL DEFAULT 2.5,
      interval REAL NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      due_at INTEGER NOT NULL,
      last_reviewed INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}
```

`src/main/db.ts`:

```ts
import type { Database } from 'better-sqlite3'
import { createSchema } from './schema'

export interface Expression {
  id: number; plain: string; advanced: string; example: string
  topic: string | null; source: string; created_at: number
}
export type NewExpression = Omit<Expression, 'id' | 'created_at'>

export function initDb(db: Database): Database {
  createSchema(db)
  return db
}

export function addExpression(db: Database, e: NewExpression): number {
  const info = db.prepare(
    `INSERT INTO expressions (plain,advanced,example,topic,source,created_at)
     VALUES (@plain,@advanced,@example,@topic,@source,@created_at)`
  ).run({ ...e, created_at: Date.now() })
  const id = Number(info.lastInsertRowid)
  db.prepare(
    `INSERT INTO srs_state (expr_id, due_at) VALUES (?, ?)`
  ).run(id, Date.now())
  return id
}

export function listExpressions(db: Database): Expression[] {
  return db.prepare(`SELECT * FROM expressions ORDER BY id`).all() as Expression[]
}

export function updateExpression(db: Database, id: number, patch: Partial<NewExpression>): void {
  const fields = Object.keys(patch)
  if (fields.length === 0) return
  const set = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE expressions SET ${set} WHERE id = @id`).run({ ...patch, id })
}

export function deleteExpression(db: Database, id: number): void {
  db.prepare(`DELETE FROM expressions WHERE id = ?`).run(id)
  db.prepare(`DELETE FROM srs_state WHERE expr_id = ?`).run(id)
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run tests/db.test.ts
# 预期：PASS
```

- [ ] **Step 5: Commit**

```bash
git add tests/db.test.ts src/main/db.ts src/main/schema.ts
git commit -m "feat: SQLite schema 与表达块 CRUD"
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
- Consumes: `Expression`（Task 1），`review/Grade/SrsState`（Task 2）
- Produces:
  - `getDueExpression(db, now: number): Expression | null`
  - `applyReview(db, exprId: number, grade: Grade, now: number): void`

- [ ] **Step 1: 写失败测试**

`tests/scheduler.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { createSchema } from '../src/main/schema'
import { addExpression } from '../src/main/db'
import { getDueExpression, applyReview } from '../src/main/scheduler'

describe('调度器', () => {
  let db: any
  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
  })

  it('到期则返回该表达块', () => {
    const id = addExpression(db, {
      plain: 'p', advanced: 'a', example: 'e', topic: null, source: '内置',
    })
    const due = getDueExpression(db, Date.now())
    expect(due).not.toBeNull()
    expect(due!.id).toBe(id)
  })

  it('评分"记得"后短时间内不再到期', () => {
    const id = addExpression(db, {
      plain: 'p', advanced: 'a', example: 'e', topic: null, source: '内置',
    })
    applyReview(db, id, 2, Date.now())
    expect(getDueExpression(db, Date.now())).toBeNull()
  })

  it('评分"忘了"后很快再次到期', () => {
    const id = addExpression(db, {
      plain: 'p', advanced: 'a', example: 'e', topic: null, source: '内置',
    })
    applyReview(db, id, 2, Date.now())
    applyReview(db, id, 0, Date.now())
    // 10 分钟内到期 → 用 11 分钟后的时间戳判定
    expect(getDueExpression(db, Date.now() + 11 * 60 * 1000)).not.toBeNull()
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
import type { Database } from 'better-sqlite3'
import type { Expression } from './db'
import { review, type Grade, type SrsState } from './srs'

export function getDueExpression(db: Database, now: number): Expression | null {
  const row = db.prepare(
    `SELECT e.* FROM expressions e
     JOIN srs_state s ON s.expr_id = e.id
     WHERE s.due_at <= ?
     ORDER BY s.due_at ASC LIMIT 1`
  ).get(now) as Expression | undefined
  return row ?? null
}

export function applyReview(db: Database, exprId: number, grade: Grade, now: number): void {
  const cur = db.prepare(
    `SELECT easiness, interval, repetitions FROM srs_state WHERE expr_id = ?`
  ).get(exprId) as SrsState | undefined
  const base: SrsState = cur ?? { easiness: 2.5, interval: 0, repetitions: 0 }
  const next = review(base, grade)
  const dueAt = now + Math.round(next.interval * 60 * 1000)
  db.prepare(
    `UPDATE srs_state SET easiness=?, interval=?, repetitions=?, due_at=?, last_reviewed=?
     WHERE expr_id=?`
  ).run(next.easiness, next.interval, next.repetitions, dueAt, now, exprId)
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
- Produces:
  - `getSetting(db, key: string): string | null`
  - `setSetting(db, key: string, value: string): void`
  - `getAllSettings(db): Record<string, string>`
  - `DEFAULT_SETTINGS: Record<string, string>`（含 popup_interval_min、popup_stay_sec、recall_delay_sec、popup_position、sound_enabled、sound_volume、sound_file、daily_cap、ai_provider、ai_api_key、ai_base_url、ai_model）

- [ ] **Step 1: 写失败测试**

`tests/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { createSchema } from '../src/main/schema'
import { getSetting, setSetting, getAllSettings, DEFAULT_SETTINGS } from '../src/main/settings'

describe('settings', () => {
  let db: any
  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
  })

  it('未设置时返回默认值', () => {
    expect(getSetting(db, 'popup_interval_min')).toBe(DEFAULT_SETTINGS.popup_interval_min)
  })

  it('写入后可读取，且覆盖默认值', () => {
    setSetting(db, 'popup_interval_min', '10')
    expect(getSetting(db, 'popup_interval_min')).toBe('10')
  })

  it('getAllSettings 合并默认值与已存值', () => {
    setSetting(db, 'sound_enabled', 'false')
    const all = getAllSettings(db)
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
import type { Database } from 'better-sqlite3'

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

export function getSetting(db: Database, key: string): string | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined
  return row?.value ?? DEFAULT_SETTINGS[key] ?? null
}

export function setSetting(db: Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

export function getAllSettings(db: Database): Record<string, string> {
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as {
    key: string
    value: string
  }[]
  const out: Record<string, string> = { ...DEFAULT_SETTINGS }
  for (const r of rows) out[r.key] = r.value
  return out
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

> 说明：`db.ts` 中的 `Expression`/`NewExpression` 后续改为从 `src/shared/ipc-types.ts` 导入并 re-export，避免重复定义（Task 1 已定义的本地接口保留即可，渲染端统一用 shared 里的）。

- [ ] **Step 2: 主进程注册 handler**

`src/main/ipc.ts`:

```ts
import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import {
  addExpression, deleteExpression, listExpressions, updateExpression,
  type NewExpression,
} from './db'
import { getAllSettings, setSetting } from './settings'

export function registerIpc(db: Database): void {
  ipcMain.handle('expr:list', () => listExpressions(db))
  ipcMain.handle('expr:add', (_e, expr: NewExpression) => addExpression(db, expr))
  ipcMain.handle('expr:update', (_e, id: number, patch: Partial<NewExpression>) =>
    updateExpression(db, id, patch))
  ipcMain.handle('expr:delete', (_e, id: number) => deleteExpression(db, id))
  ipcMain.handle('settings:getAll', () => getAllSettings(db))
  ipcMain.handle('settings:set', (_e, key: string, value: string) =>
    setSetting(db, key, value))
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

- [ ] **Step 4: 主入口打开数据库并注册 IPC**

`src/main/index.ts`（在 `app.whenReady` 中）:

```ts
import Database from 'better-sqlite3'
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createSchema } from './schema'
import { registerIpc } from './ipc'

let db: Database.Database

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
  const dbPath = join(app.getPath('userData'), 'tasymize.db')
  db = new Database(dbPath)
  createSchema(db)
  registerIpc(db)
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
  - `startEngine(db, getPopup: () => BrowserWindow): void`（按 popup_interval_min 轮询到期并弹出）

- [ ] **Step 1: 弹窗窗口创建（frameless/透明/置顶/不抢焦点）**

`src/main/popup.ts`:

```ts
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type { Expression } from './db'

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
import type { Database } from 'better-sqlite3'
import type { BrowserWindow } from 'electron'
import { getDueExpression } from './scheduler'
import { getSetting } from './settings'
import { showPopup } from './popup'

export function startEngine(db: Database, getPopup: () => BrowserWindow): void {
  const tick = (): void => {
    const now = Date.now()
    const due = getDueExpression(db, now)
    if (due) {
      showPopup(getPopup(), due)
      // 弹出后给一个兜底间隔，避免同一条连续弹
      const minGapMs = Number(getSetting(db, 'popup_interval_min')) * 60 * 1000
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
  startEngine(db, () => popup)
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
    applyReview(db, id, grade, Date.now())
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
- Produces: `seedIfEmpty(db): number`（返回导入条数；已有数据则 0）

- [ ] **Step 1: 写失败测试**

`tests/seed.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { createSchema } from '../src/main/schema'
import { seedIfEmpty } from '../src/main/seed'
import { listExpressions } from '../src/main/db'

describe('seed', () => {
  let db: any
  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
  })

  it('空库导入一批内置表达块', () => {
    const n = seedIfEmpty(db)
    expect(n).toBeGreaterThan(0)
    expect(listExpressions(db).length).toBe(n)
  })

  it('非空库不重复导入', () => {
    seedIfEmpty(db)
    expect(seedIfEmpty(db)).toBe(0)
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
import type { Database } from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { addExpression, listExpressions } from './db'

interface SeedItem { plain: string; advanced: string; example: string; topic: string }

export function seedIfEmpty(db: Database, seedPath?: string): number {
  if (listExpressions(db).length > 0) return 0
  const file = seedPath ?? join(__dirname, '../../data/seed-expressions.json')
  const items = JSON.parse(readFileSync(file, 'utf-8')) as SeedItem[]
  for (const it of items) {
    addExpression(db, { ...it, source: '内置' })
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

`src/main/index.ts` 在 `createSchema(db)` 后追加：

```ts
import { seedIfEmpty } from './seed'
// ...
  seedIfEmpty(db)
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
