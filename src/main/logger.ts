// 轻量调度日志（tracker）：把"每次 tick 的弹/不弹决策、popCount 变化、评分结果"写到本地文件，
// 让"突然不弹词"这类问题能直接查日志定位，不用靠猜。
//
// 设计要点：
// - 写 userData/logs/scheduler.log（与数据同级，好找）；Electron 外（vitest）惰性降级为只 console。
// - 追加写 + 行数滚动（超 MAX_LINES 截断保留尾部），不无限涨。
// - 全程 try/catch：日志失败绝不抛出——调度主链路不能因日志而崩（否则本末倒置）。
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const MAX_LINES = 500 // 滚动上限：保留最近 500 行

// 测试注入内存缓冲；生产写文件。_setLogSinkForTests 仅供测试替换写入目标。
type Sink = (line: string) => void
let memSink: Sink | null = null

let logFilePath: string | null = null

// 惰性解析日志文件路径：首次写时才算（此时 Electron app 已 ready）。
// vitest Node 环境取 app.getPath 会抛 → catch 后 logFilePath 保持 null，降级 console。
function resolveLogFile(): string | null {
  if (logFilePath) return logFilePath
  try {
    // 延迟 require，避免模块加载期就触碰 electron（测试环境无 app）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as typeof import('electron')
    const dir = join(app.getPath('userData'), 'logs')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    logFilePath = join(dir, 'scheduler.log')
    return logFilePath
  } catch {
    return null
  }
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function writeLine(line: string): void {
  if (memSink) { memSink(line); return }
  const file = resolveLogFile()
  if (!file) { console.log(line); return } // 测试/无 Electron 环境降级
  try {
    appendFileSync(file, line + '\n', 'utf8')
    trimIfNeeded(file)
  } catch (err) {
    console.warn('[logger] 写日志失败（忽略，不影响调度）：', err)
  }
}

// 行数超上限则截断保留尾部 MAX_LINES 行（简单滚动，避免文件无限增大）。
function trimIfNeeded(file: string): void {
  try {
    const content = readFileSync(file, 'utf8')
    const lines = content.split('\n')
    if (lines.length > MAX_LINES * 2) {
      // 超 2 倍才重写，摊销截断成本（不必每行都读写全文件）
      writeFileSync(file, lines.slice(-MAX_LINES).join('\n'), 'utf8')
    }
  } catch {
    /* 截断失败无妨，下次再试 */
  }
}

/** 写一条调度日志。message 为单行内容（调用方负责拼好，别带换行）。 */
export function logSchedule(message: string): void {
  writeLine(`[${timestamp()}] ${message}`)
}

// —— 测试专用 ——
export const _logTest = {
  lines: [] as string[],
  start(): void {
    this.lines = []
    memSink = (l) => this.lines.push(l)
  },
  stop(): void {
    memSink = null
    this.lines = []
  },
}
