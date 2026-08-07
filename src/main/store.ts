import StoreImport, { type Options } from 'electron-store'

// electron-store v11 是纯 ESM；CJS 产物里 require(esm) 返回模块命名空间，类挂在 .default 上；
// ESM/vitest 下 default 导入直接是类。两种产物都兼容地取构造函数。
const Store = ((StoreImport as unknown as { default?: typeof StoreImport }).default ??
  StoreImport) as typeof StoreImport

export interface SrsState {
  easiness: number
  repetitions: number
  duePop: number // 第几次弹窗时该词到期（弹窗节拍队列模型，取代旧 due_at 时间戳）
  forgotCount: number // 点了几次"忘了"（grade 0），历史累计只增不减
}

// —— B1 学习统计 ——
// 评分事件流：每次评分追加一条（明细 + 精确正确率的真源）。cap 2000 截头防无限增长。
export interface ReviewEvent {
  ts: number // Date.now() 毫秒时间戳
  vocabId: number
  grade: 0 | 1 | 2 // 0=忘了 1=模糊 2=认识（correct 仅认 grade 2）
}
// 每日聚合：{date, total, correct}，date 为本地时区 YYYY-MM-DD。趋势图直接读它，O(1)。
// cap 400 天截头。与事件流双存：事件流管近期明细，dailyStats 管长期趋势。
export interface DailyStat {
  date: string
  total: number
  correct: number
}

interface Schema {
  vocab: import('./vocab').VocabItem[]
  srsStates: Record<number, SrsState>
  settings: Record<string, string>
  nextId: number
  popCount: number // 全局弹窗节拍计数器：弹一次 +1，是调度唯一的"时钟"
  trash: { item: import('./vocab').VocabItem; deletedAt: number }[] // 回收站：软删除的词包装，按 deletedAt 索引还原/清空
  reviewEvents: ReviewEvent[] // B1 评分事件流（按 ts 升序追加）
  dailyStats: DailyStat[] // B1 每日聚合（按 date 升序，同日合并）
}

// 测试时注入内存实现；生产用 electron-store 持久化
let mem: Schema | null = null

const defaults: Schema = { vocab: [], srsStates: {}, settings: {}, nextId: 1, popCount: 0, trash: [], reviewEvents: [], dailyStats: [] }
// 显式传 projectName：Electron 外（如 vitest Node 环境）conf 无法从 app 取名，会抛错；
// electron-store 的 Options 类型把 projectName Except 掉了（生产环境由 app 名派生），这里运行时透传给 conf，需断言
const store = new Store<Schema>({ defaults, projectName: 'vocall' } as Options<Schema>)

function read<K extends keyof Schema>(key: K): Schema[K] {
  return mem ? mem[key] : store.get(key)
}
function write<K extends keyof Schema>(key: K, val: Schema[K]): void {
  if (mem) { mem[key] = val } else { store.set(key, val) }
}

export function _resetStoreForTests(): void {
  mem = { vocab: [], srsStates: {}, settings: {}, nextId: 1, popCount: 0, trash: [], reviewEvents: [], dailyStats: [] }
}

// 弹窗节拍计数器：engine 每弹一次调 incrementPop，调度和 SRS 用 popCount 判定到期。
export function getPopCount(): number {
  return read('popCount')
}
export function incrementPop(): number {
  const n = read('popCount') + 1
  write('popCount', n)
  return n
}
// 直接设定节拍数：仅用于"时钟快进"——引擎空转时把 popCount 追到最近到期点，
// 消除"所有词 duePop 都在未来、popCount 却因不弹而停摆"的死锁（详见 scheduler.advancePopToNextDue）。
export function setPopCount(n: number): void {
  write('popCount', n)
}

export function allocId(): number {
  const id = read('nextId')
  write('nextId', id + 1)
  return id
}
// 批量导入用的 id 区间分配：peek 只读起点不写，reserveNextId 一次性把 nextId 推进 n 格。
// 配合 addVocabBatch——全程内存发 id，最后 reserve 一次写盘（替代逐词 allocId 各写一次）。
export function peekNextId(): number {
  return read('nextId')
}
export function reserveNextId(n: number): void {
  write('nextId', read('nextId') + n)
}

export function getSrsState(id: number): SrsState | undefined {
  return read('srsStates')[id]
}
export function setSrsState(id: number, s: SrsState): void {
  write('srsStates', { ...read('srsStates'), [id]: s })
}
// 批量合并 srsStates：一次写盘（替代逐个 setSrsState 各写一次全量）。addVocabBatch 用。
export function setSrsStateBatch(batch: Record<number, SrsState>): void {
  write('srsStates', { ...read('srsStates'), ...batch })
}
export function deleteSrsState(id: number): void {
  const m = { ...read('srsStates') }
  delete m[id]
  write('srsStates', m)
}

// 数据迁移：给缺少 status/book 字段的旧词补默认值（status='learning'、book=null）。
// 已有这两个字段的词不动。启动时调用一次，幂等可重复跑。
export function migrateVocabStatus(): void {
  const list = read('vocab') as unknown as Array<Record<string, unknown>>
  let changed = false
  const migrated = list.map((w) => {
    const nw = { ...w }
    if (nw.status === undefined) { nw.status = 'learning'; changed = true }
    if (nw.book === undefined) { nw.book = null; changed = true }
    return nw
  })
  if (changed) write('vocab', migrated as unknown as Schema['vocab'])
}

// SRS 状态迁移：旧模型（interval 分钟 + due_at 时间戳）→ 新模型（duePop 节拍数）。
// 旧时间数据无法精确换算成节拍，统一重置为 duePop=当前 popCount（立即可弹）——立即复习无害。
// 幂等：已是 duePop 模型的状态不动。
export function migrateSrsToPop(): void {
  const states = read('srsStates') as unknown as Record<string, Record<string, unknown>>
  const now = read('popCount')
  let changed = false
  const next: Record<number, SrsState> = {}
  for (const [k, v] of Object.entries(states)) {
    if (typeof v.duePop === 'number') { next[Number(k)] = v as unknown as SrsState; continue }
    changed = true
    next[Number(k)] = {
      easiness: typeof v.easiness === 'number' ? v.easiness : 2.5,
      repetitions: typeof v.repetitions === 'number' ? v.repetitions : 0,
      duePop: now,
      forgotCount: 0, // 旧时间模型状态必然无忘词计数，顺手补 0（与 migrateForgotCount 同语义）
    }
  }
  if (changed) write('srsStates', next)
}

// 忘词计数迁移：旧 SRS 状态缺 forgotCount 字段的补 0；已有则不动。启动时调用一次，幂等可重复跑。
export function migrateForgotCount(): void {
  const states = read('srsStates') as unknown as Record<string, Record<string, unknown>>
  let changed = false
  const next: Record<number, SrsState> = {}
  for (const [k, v] of Object.entries(states)) {
    if (typeof v.forgotCount === 'number') { next[Number(k)] = v as unknown as SrsState; continue }
    changed = true
    next[Number(k)] = { ...(v as unknown as SrsState), forgotCount: 0 }
  }
  if (changed) write('srsStates', next)
}

// 汇总所有词的忘词计数（生词库列表"已忘 N"徽标 / srs:getForgotCounts IPC 用）；缺字段当 0。
export function getForgotCounts(): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [k, v] of Object.entries(read('srsStates'))) {
    out[Number(k)] = (v as SrsState).forgotCount ?? 0
  }
  return out
}

// —— B1 学习统计：事件流 + 每日聚合 ——

// 本地时区日期键 YYYY-MM-DD。禁用 toISOString()——它返回 UTC，跨时区会把深夜评分算到前一天。
export function localDateKey(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const MAX_REVIEW_EVENTS = 2000 // 事件流上限：截头保尾（留最新），防无限增长
const MAX_DAILY_STATS = 400 // 每日聚合上限：约一年出头，截头保尾

// 追加一条评分事件（按 ts 升序）。超上限截掉最旧的。
export function appendReviewEvent(e: ReviewEvent): void {
  const list = [...(read('reviewEvents') ?? []), e]
  if (list.length > MAX_REVIEW_EVENTS) list.splice(0, list.length - MAX_REVIEW_EVENTS)
  write('reviewEvents', list)
}

// 累加当日聚合：有当日条目则 +1（correct 由调用方判 grade===2），无则新建。同日合并、按 date 升序。
export function bumpDailyStat(date: string, correct: boolean): void {
  const list = [...(read('dailyStats') ?? [])]
  const last = list[list.length - 1]
  if (last && last.date === date) {
    list[list.length - 1] = { date, total: last.total + 1, correct: last.correct + (correct ? 1 : 0) }
  } else {
    list.push({ date, total: 1, correct: correct ? 1 : 0 })
    list.sort((a, b) => (a.date < b.date ? -1 : 1)) // 防御乱序（时钟回拨），保持升序
    if (list.length > MAX_DAILY_STATS) list.splice(0, list.length - MAX_DAILY_STATS)
  }
  write('dailyStats', list)
}

// 读全量事件流（升序）；缺 key 兜底空数组。
export function getReviewEvents(): ReviewEvent[] {
  return read('reviewEvents') ?? []
}

// 读全量每日聚合（按 date 升序）；缺 key 兜底空数组。
export function getDailyStats(): DailyStat[] {
  return read('dailyStats') ?? []
}

export const vocabBox = {
  get: () => read('vocab'),
  set: (v: Schema['vocab']) => write('vocab', v),
}
export const trashBox = {
  get: () => read('trash'),
  set: (v: Schema['trash']) => write('trash', v),
}
export const settingsBox = {
  get: () => read('settings'),
  set: (v: Schema['settings']) => write('settings', v),
}
