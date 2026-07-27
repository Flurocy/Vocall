import { contextBridge, ipcRenderer } from 'electron'
import type { NewVocabItem } from '../shared/ipc-types'

contextBridge.exposeInMainWorld('tasymize', {
  listVocab: () => ipcRenderer.invoke('vocab:list'),
  addVocab: (e: NewVocabItem) => ipcRenderer.invoke('vocab:add', e),
  updateVocab: (id: number, patch: Partial<NewVocabItem>) =>
    ipcRenderer.invoke('vocab:update', id, patch),
  deleteVocab: (id: number) => ipcRenderer.invoke('vocab:delete', id),
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key: string, value: string) =>
    ipcRenderer.invoke('settings:set', key, value),
  onShow: (cb: (expr: unknown) => void) =>
    ipcRenderer.on('popup:show', (_e, expr) => cb(expr)),
  getCurrent: () => ipcRenderer.invoke('popup:getCurrent'),
  grade: (id: number, grade: 0 | 1 | 2) =>
    ipcRenderer.invoke('popup:grade', id, grade),
  dismiss: () => ipcRenderer.invoke('popup:dismiss'),
  // 拖拽用 send（fire-and-forget），不走 invoke，避免高频 mousemove 堆积 Promise
  dragStart: (x: number, y: number) => ipcRenderer.send('popup:dragStart', { x, y }),
  dragMove: (x: number, y: number) => ipcRenderer.send('popup:dragMove', { x, y }),
  // 自绘标题栏窗口控制
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winMaximize: () => ipcRenderer.invoke('win:maximize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  // AI：测试 DeepSeek 连接（key 只在主进程，渲染端拿不到）
  testAi: () => ipcRenderer.invoke('ai:test'),
  // 词书
  listWordbooks: () => ipcRenderer.invoke('wordbook:list'),
  addWordbook: (bookId: string) => ipcRenderer.invoke('wordbook:add', bookId),
  removeWordbook: (bookId: string) => ipcRenderer.invoke('wordbook:remove', bookId),
})
