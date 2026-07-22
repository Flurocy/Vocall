import StoreImport, { type Options } from 'electron-store'

// electron-store v11 是纯 ESM；CJS 产物里 require(esm) 返回模块命名空间，类挂在 .default 上；
// ESM/vitest 下 default 导入直接是类。两种产物都兼容地取构造函数。
const Store = ((StoreImport as unknown as { default?: typeof StoreImport }).default ??
  StoreImport) as typeof StoreImport

export interface SrsState {
  easiness: number; interval: number; repetitions: number
  due_at: number; last_reviewed: number | null
}

interface Schema {
  vocab: import('./vocab').VocabItem[]
  srsStates: Record<number, SrsState>
  settings: Record<string, string>
  nextId: number
}

// 测试时注入内存实现；生产用 electron-store 持久化
let mem: Schema | null = null

const defaults: Schema = { vocab: [], srsStates: {}, settings: {}, nextId: 1 }
// 显式传 projectName：Electron 外（如 vitest Node 环境）conf 无法从 app 取名，会抛错；
// electron-store 的 Options 类型把 projectName Except 掉了（生产环境由 app 名派生），这里运行时透传给 conf，需断言
const store = new Store<Schema>({ defaults, projectName: 'tasymize' } as Options<Schema>)

function read<K extends keyof Schema>(key: K): Schema[K] {
  return mem ? mem[key] : store.get(key)
}
function write<K extends keyof Schema>(key: K, val: Schema[K]): void {
  if (mem) { mem[key] = val } else { store.set(key, val) }
}

export function _resetStoreForTests(): void {
  mem = { vocab: [], srsStates: {}, settings: {}, nextId: 1 }
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

export const vocabBox = {
  get: () => read('vocab'),
  set: (v: Schema['vocab']) => write('vocab', v),
}
export const settingsBox = {
  get: () => read('settings'),
  set: (v: Schema['settings']) => write('settings', v),
}
