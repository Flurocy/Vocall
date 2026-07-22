import { ipcMain } from 'electron'
import {
  addVocab, deleteVocab, listVocab, updateVocab,
  type NewVocabItem,
} from './vocab'
import { getAllSettings, setSetting } from './settings'
import { applyReview } from './scheduler'

export function registerIpc(): void {
  ipcMain.handle('vocab:list', () => listVocab())
  ipcMain.handle('vocab:add', (_e, item: NewVocabItem) => addVocab(item).id)
  ipcMain.handle('vocab:update', (_e, id: number, patch: Partial<NewVocabItem>) =>
    updateVocab(id, patch))
  ipcMain.handle('vocab:delete', (_e, id: number) => deleteVocab(id))
  ipcMain.handle('settings:getAll', () => getAllSettings())
  ipcMain.handle('settings:set', (_e, key: string, value: string) =>
    setSetting(key, value))
  ipcMain.handle('popup:grade', (_e, id: number, grade: 0 | 1 | 2) => {
    applyReview(id, grade, Date.now())
  })
}
