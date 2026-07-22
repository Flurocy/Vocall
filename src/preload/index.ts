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
})
