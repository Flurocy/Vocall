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
  onShow: (cb: (expr: unknown) => void) =>
    ipcRenderer.on('popup:show', (_e, expr) => cb(expr)),
  getCurrent: () => ipcRenderer.invoke('popup:getCurrent'),
  grade: (id: number, grade: 0 | 1 | 2) =>
    ipcRenderer.invoke('popup:grade', id, grade),
  dismiss: () => ipcRenderer.invoke('popup:dismiss'),
})
