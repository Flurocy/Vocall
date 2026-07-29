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

interface Schema {
  vocab: import('./vocab').VocabItem[]
  srsStates: Record<number, SrsState>
  settings: Record<string, string>
  nextId: number
  popCount: number // 全局弹窗节拍计数器：弹一次 +1，是调度唯一的"时钟"
  trash: { item: import('./vocab').VocabItem; deletedAt: number }[] // 回收站：软删除的词包装，按 deletedAt 索引还原/清空
}

// 测试时注入内存实现；生产用 electron-store 持久化
let mem: Schema | null = null

const defaults: Schema = { vocab: [], srsStates: {}, settings: {}, nextId: 1, popCount: 0, trash: [] }
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
  mem = { vocab: [], srsStates: {}, settings: {}, nextId: 1, popCount: 0, trash: [] }
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
