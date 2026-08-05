import { ipcMain, app, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import {
  addVocab, addVocabBatch, deleteVocab, listVocab, updateVocab,
  listTrash, restoreVocab, purgeVocab, clearTrash,
  type NewVocabItem,
} from './vocab'
import { getAllSettings, setSetting, getSetting, getAiConfig, resetElasticSettings } from './settings'
import { applyReview, masterVocab, reviveVocab, fillLearningQueue } from './scheduler'
import { getForgotCounts } from './store'
import { callDeepseek, generateThemeVocab, translateVocab } from './ai'
import { fetchPronunciation } from './audio'
import { listWordbooks, addWordbookToPlan, removeWordbookFromPlan, getWordbookWords, addWordsToPlan } from './wordbook'
import { reregisterHotkey } from './hotkey'
import { resizePopup, applyPopupOpacity } from './popup'
import { rescheduleInterval } from './engine'
import { checkUpdate } from './updater'

// getPopup：设置页改快捷键后需重绑 globalShortcut，而 hotkey 重绑要能拿到弹窗引用。
// popupWin 由 index.ts 创建，通过此闭包传入（与 registerPopupIpc / startEngine 同款模式）。
export function registerIpc(getPopup: () => BrowserWindow | null): void {
  ipcMain.handle('vocab:list', () => listVocab())
  ipcMain.handle('vocab:add', (_e, item: NewVocabItem) => addVocab(item).id)
  // 批量添加（AI 主题生成勾选入库）：一次 IPC + 内存组装 + 三次写盘，修逐词 IPC 卡顿。
  // 返回实际加入条数（撞库/回收站/批内重复的已静默跳过），前端据此算 skipped = 想加 − 实际。
  ipcMain.handle('vocab:addBatch', (_e, items: NewVocabItem[]) => addVocabBatch(items))
  ipcMain.handle('vocab:update', (_e, id: number, patch: Partial<NewVocabItem>) =>
    updateVocab(id, patch))
  ipcMain.handle('vocab:delete', (_e, id: number) => deleteVocab(id))
  // 回收站：列表/还原/彻底删除/清空（deleteVocab 现为软删除）
  ipcMain.handle('vocab:listTrash', () => listTrash())
  ipcMain.handle('vocab:restore', (_e, id: number) => restoreVocab(id))
  ipcMain.handle('vocab:purge', (_e, id: number) => purgeVocab(id))
  ipcMain.handle('vocab:clearTrash', () => clearTrash())
  ipcMain.handle('settings:getAll', () => getAllSettings())
  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    setSetting(key, value)
    // 快捷键改了 → 重新注册 globalShortcut（先注销旧绑定再按新值注册）。
    // getPopup 返回 null 时 reregister/popupNow 内部自判不弹，无需断言。
    if (key === 'popup_hotkey') reregisterHotkey(getPopup)
    // 界面大小滑块改了 → 按新 scale 重算弹窗尺寸并 resize（重锚右下角）。
    // getPopup 可能返回 null（弹窗尚未创建），resizePopup 内部自判 no-op。
    if (key === 'popup_scale') resizePopup(getPopup())
    // 透明度滑块改了 → 按新 opacity setOpacity。同样 null 自判 no-op。
    if (key === 'popup_opacity') applyPopupOpacity(getPopup())
    // 弹出间隔改了 → 重排引擎计时：取消当前挂起的旧间隔，从当下起按新间隔走（立即生效，
    // 不再等旧周期到期）。rescheduleInterval 内部只在挂起的是"弹出间隔"计时时才动。
    if (key === 'popup_interval_sec') rescheduleInterval()
    // 学习队列容量改了 → 立即补位：调大即时从 new 解锁新词进 learning（不再等毕业/重启）。
    // 调小则只降上限——fillLearningQueue 本就只补不踢，已在学的词不动，毕业后自然回落。
    if (key === 'learning_cap') fillLearningQueue()
  })
  // 恢复默认：只重置记忆节奏弹性数值键（外观/音效/AI 不动）
  ipcMain.handle('settings:resetElastic', () => resetElasticSettings())
  ipcMain.handle('popup:grade', (_e, id: number, grade: 0 | 1 | 2) => {
    // 预览词（id=-1，设置页外观预览）不进调度——防护规则③：预览绝不影响 SRS。
    // 渲染端点击预览卡评分按钮后紧随 popup:dismiss 关窗，这里静默忽略即可。
    if (id < 0) return
    applyReview(id, grade)
  })
  // 已掌握终态：master 标背完不再弹；revive 让 mastered 词复活重背（进 learning 立即可弹，不限 cap）
  ipcMain.handle('vocab:master', (_e, id: number) => {
    if (id < 0) return // 预览词同上拦截
    masterVocab(id)
  })
  ipcMain.handle('vocab:revive', (_e, id: number) => reviveVocab(id))
  // 忘词计数汇总：id→forgotCount（生词库列表"已忘 N"徽标用）
  ipcMain.handle('srs:getForgotCounts', () => getForgotCounts())
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
      await callDeepseek(cfg, { user: '回复"ok"两个字即可', maxTokens: 128, temperature: 0, timeoutMs: 90_000, disableThinking: true })
      return { ok: true, message: `连接成功（${cfg.model}）` }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // AI 内容生产：主题词组生成 + 生词 AI 翻译（均返回预览数据，不入库——入库由前端 vocab:add）。
  // key 没配 / 网络 / 解析错误一律 throw（invoke reject），渲染端 catch(err) 显示 err.message。
  ipcMain.handle('ai:generateTheme', async (_e, theme: string, n?: number) =>
    generateThemeVocab(theme, n))
  ipcMain.handle('ai:translate', async (_e, word: string) => translateVocab(word))

  // 发音：读 audio_accent 设置 → fetch 有道 dictvoice → 返回 base64 data URL（渲染端 new Audio 播）。
  // 失败抛 Error（invoke reject），渲染端 catch 静默（断网/超时不崩、不打扰）。
  ipcMain.handle('audio:pronounce', async (_e, word: string) => {
    const accent = getSetting('audio_accent') ?? 'british'
    return fetchPronunciation(word, accent)
  })

  // 版本与更新检查（GitHub releases/latest）+ 外链跳转（shell.openExternal 开系统浏览器）。
  // checkUpdate 一律 resolve（失败返回 error），渲染端据此显示"已是最新/发现新版本/检查失败"。
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:checkUpdate', () => checkUpdate())
  ipcMain.handle('app:openExternal', (_e, url: string) => {
    // 只放行 http(s)，防任意协议跳转
    if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url)
  })
}
