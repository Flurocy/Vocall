import { app } from 'electron'
import { join } from 'path'

// 运行时资源路径解析（三态兼容）：
// - 生产（打包后 Electron app 可用 + isPackaged）：process.resourcesPath（electron-builder extraResources 落点）
// - 开发（Electron app 可用 + !isPackaged）：app.getAppPath()（项目根）
// - 测试（vitest Node 环境无 Electron app）：process.cwd()（项目根，vitest 从项目根跑）
// data/（词书、种子）与 resources/（图标）统一走此根，配合 electron-builder extraResources 把这两个目录打进包。
// 注意：vitest 下 require('electron') 返回路径字符串（非 app 对象），访问 app.isPackaged 会抛 TypeError → catch 走 cwd。
export function resolveResource(...segments: string[]): string {
  let base: string
  try {
    base = app.isPackaged ? process.resourcesPath : app.getAppPath()
  } catch {
    base = process.cwd()
  }
  return join(base, ...segments)
}
