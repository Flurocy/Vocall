import { app, Menu, Tray, nativeImage } from 'electron'
import { existsSync } from 'fs'
import { resolveResource } from './paths'

// 托盘图标：resources/tray-icon.png（当前为亮色系简洁占位图， emerald 底 + 白色 T）。
// 用户后续自换：直接把同名 PNG 放到 resources/tray-icon.png 即可（建议 32x32 或更高）。
// 路径解析：打包/产物下 __dirname 为 out/main，上两级到应用根；
// dev 下再兜底 app.getAppPath()（项目根）resources。
function resolveTrayIcon(): Electron.NativeImage {
  // 统一走 resolveResource（打包 process.resourcesPath / 开发 app.getAppPath / 测试 cwd）
  const p = resolveResource('resources', 'tray-icon.png')
  if (existsSync(p)) return nativeImage.createFromPath(p)
  console.warn('[tray] 未找到 resources/tray-icon.png，使用空图标')
  return nativeImage.createEmpty()
}

// openManager / onQuit 由 index.ts 注入（它持有管理/弹窗引用）
export function createTray(openManager: () => void, onQuit: () => void): Tray {
  const tray = new Tray(resolveTrayIcon())
  tray.setToolTip('Vocall')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 Vocall', click: openManager },
      { type: 'separator' },
      // 彻底退出：onQuit 先清理弹窗/引擎，再 app.quit()
      { label: '退出', click: () => { onQuit(); app.quit() } },
    ]),
  )
  // 左键单击托盘图标同样唤出主界面
  tray.on('click', openManager)
  return tray
}
