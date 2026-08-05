import { contextBridge, ipcRenderer } from 'electron'
import type { NewVocabItem, PreviewOverrides } from '../shared/ipc-types'

contextBridge.exposeInMainWorld('vocall', {
  listVocab: () => ipcRenderer.invoke('vocab:list'),
  addVocab: (e: NewVocabItem) => ipcRenderer.invoke('vocab:add', e),
  // 批量添加（AI 主题生成勾选入库）：一次 IPC 整批，避免逐词 invoke 往返卡顿。返回实际加入条数。
  addVocabBatch: (items: NewVocabItem[]) => ipcRenderer.invoke('vocab:addBatch', items),
  updateVocab: (id: number, patch: Partial<NewVocabItem>) =>
    ipcRenderer.invoke('vocab:update', id, patch),
  deleteVocab: (id: number) => ipcRenderer.invoke('vocab:delete', id),
  // 回收站：列表/还原/彻底删除/清空
  listTrash: () => ipcRenderer.invoke('vocab:listTrash'),
  restore: (id: number) => ipcRenderer.invoke('vocab:restore', id),
  purge: (id: number) => ipcRenderer.invoke('vocab:purge', id),
  clearTrash: () => ipcRenderer.invoke('vocab:clearTrash'),
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key: string, value: string) =>
    ipcRenderer.invoke('settings:set', key, value),
  resetElasticSettings: () => ipcRenderer.invoke('settings:resetElastic'),
  onShow: (cb: (expr: unknown) => void) =>
    ipcRenderer.on('popup:show', (_e, expr) => cb(expr)),
  // 真词显示时拖"弹窗字体"滑块的实时倍率消息（临时值，不提交设置）
  onFontScale: (cb: (v: unknown) => void) =>
    ipcRenderer.on('popup:fontScale', (_e, v) => cb(v)),
  getCurrent: () => ipcRenderer.invoke('popup:getCurrent'),
  grade: (id: number, grade: 0 | 1 | 2) =>
    ipcRenderer.invoke('popup:grade', id, grade),
  dismiss: () => ipcRenderer.invoke('popup:dismiss'),
  // 外观预览：设置页拖滑块实时预览弹窗（overrides=临时值不写设置）；松手 endPreview 3s 后收起
  previewPopup: (overrides?: PreviewOverrides) => ipcRenderer.invoke('popup:preview', overrides),
  endPreview: () => ipcRenderer.invoke('popup:endPreview'),
  // 已掌握终态：标背完/复活重背
  master: (id: number) => ipcRenderer.invoke('vocab:master', id),
  revive: (id: number) => ipcRenderer.invoke('vocab:revive', id),
  // 忘词计数汇总（生词库列表"已忘 N"徽标用）
  getForgotCounts: () => ipcRenderer.invoke('srs:getForgotCounts'),
  // 拖拽用 send（fire-and-forget），不走 invoke，避免高频 mousemove 堆积 Promise
  dragStart: (x: number, y: number) => ipcRenderer.send('popup:dragStart', { x, y }),
  dragMove: (x: number, y: number) => ipcRenderer.send('popup:dragMove', { x, y }),
  // 自绘标题栏窗口控制
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winMaximize: () => ipcRenderer.invoke('win:maximize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  // AI：测试 DeepSeek 连接（key 只在主进程，渲染端拿不到）
  testAi: () => ipcRenderer.invoke('ai:test'),
  // AI 内容生产：主题词组生成（预览，不入库——前端勾选后 vocab:add）+ 生词翻译（预览，填入新增卡片）
  generateTheme: (theme: string, n?: number) =>
    ipcRenderer.invoke('ai:generateTheme', theme, n),
  translate: (word: string) => ipcRenderer.invoke('ai:translate', word),
  // 发音：返回 base64 data URL（data:audio/mpeg;base64,...）供渲染端 new Audio(dataURL).play()
  pronounce: (word: string) => ipcRenderer.invoke('audio:pronounce', word),
  // 词书
  listWordbooks: () => ipcRenderer.invoke('wordbook:list'),
  addWordbook: (bookId: string) => ipcRenderer.invoke('wordbook:add', bookId),
  removeWordbook: (bookId: string) => ipcRenderer.invoke('wordbook:remove', bookId),
  getWordbookWords: (bookId: string) => ipcRenderer.invoke('wordbook:words', bookId),
  addWordsToPlan: (bookId: string, words: string[]) =>
    ipcRenderer.invoke('wordbook:addWords', bookId, words),
  // 版本/更新检查 + 外链跳转
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
})
