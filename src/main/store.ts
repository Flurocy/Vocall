import Store, { type Options } from 'electron-store'

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
