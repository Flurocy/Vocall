import { ipcMain } from 'electron'
import {
  addExpression, deleteExpression, listExpressions, updateExpression,
  type NewExpression,
} from './expressions'
import { getAllSettings, setSetting } from './settings'

export function registerIpc(): void {
  ipcMain.handle('expr:list', () => listExpressions())
  ipcMain.handle('expr:add', (_e, expr: NewExpression) => addExpression(expr).id)
  ipcMain.handle('expr:update', (_e, id: number, patch: Partial<NewExpression>) =>
    updateExpression(id, patch))
  ipcMain.handle('expr:delete', (_e, id: number) => deleteExpression(id))
  ipcMain.handle('settings:getAll', () => getAllSettings())
  ipcMain.handle('settings:set', (_e, key: string, value: string) =>
    setSetting(key, value))
}
