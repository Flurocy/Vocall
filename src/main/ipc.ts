import { ipcMain } from 'electron'
import {
  addVocab, deleteVocab, listVocab, updateVocab,
  type NewVocabItem,
} from './vocab'
import { getAllSettings, setSetting, getAiConfig, resetElasticSettings } from './settings'
import { applyReview } from './scheduler'
import { callDeepseek } from './ai'
import { listWordbooks, addWordbookToPlan, removeWordbookFromPlan, getWordbookWords, addWordsToPlan } from './wordbook'

export function registerIpc(): void {
  ipcMain.handle('vocab:list', () => listVocab())
  ipcMain.handle('vocab:add', (_e, item: NewVocabItem) => addVocab(item).id)
  ipcMain.handle('vocab:update', (_e, id: number, patch: Partial<NewVocabItem>) =>
    updateVocab(id, patch))
  ipcMain.handle('vocab:delete', (_e, id: number) => deleteVocab(id))
  ipcMain.handle('settings:getAll', () => getAllSettings())
  ipcMain.handle('settings:set', (_e, key: string, value: string) =>
    setSetting(key, value))
  // 恢复默认：只重置记忆节奏弹性数值键（外观/音效/AI 不动）
  ipcMain.handle('settings:resetElastic', () => resetElasticSettings())
  ipcMain.handle('popup:grade', (_e, id: number, grade: 0 | 1 | 2) => {
    applyReview(id, grade)
  })
  // 词书
  ipcMain.handle('wordbook:list', () => listWordbooks())
  ipcMain.handle('wordbook:add', (_e, bookId: string) => addWordbookToPlan(bookId))
  ipcMain.handle('wordbook:remove', (_e, bookId: string) => removeWordbookFromPlan(bookId))
  ipcMain.handle('wordbook:words', (_e, bookId: string) => getWordbookWords(bookId))
  ipcMain.handle('wordbook:addWords', (_e, bookId: string, words: string[]) =>
    addWordsToPlan(bookId, words))

  // 测试 DeepSeek 连接：用极简 prompt 发一次真实调用，验证 key/网络/模型可用。
  // 统一吞异常返回 {ok,message}，渲染端据此显示成功/失败原因（key 无效/限流/网络/超时）。
  // max_tokens 给 128：推理模型(pro)会先耗 token 在思考上，太小会导致正文为空。
  ipcMain.handle('ai:test', async (): Promise<{ ok: boolean; message: string }> => {
    try {
      const cfg = getAiConfig()
      if (!cfg.apiKey) return { ok: false, message: '请先填写 API key' }
      await callDeepseek(cfg, { user: '回复"ok"两个字即可', maxTokens: 128, temperature: 0, timeoutMs: 90_000 })
      return { ok: true, message: `连接成功（${cfg.model}）` }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })
}
