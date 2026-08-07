// 义项（一词多义）：一个词性 + 对应释义。词的 senses 数组按常用度排序，第一个=默认义项。
export interface Sense {
  pos: string     // 词性标记，如 'n.' / 'v.' / 'adj.'
  meaning: string // 该词性下的释义（可含近义并列，如 '通道；入口'）
}

export interface VocabItem {
  id: number; word: string; meaning: string; example: string
  topic: string | null
  book: string | null                   // 来源词书 id；手动/种子词为 null
  status: 'new' | 'learning' | 'review' | 'mastered' // 生命周期四态：新词/学习中/复习中/已掌握
  source: string; created_at: number
  // —— 一词多义（增量字段，undefined=单义词/旧数据，一切照旧）——
  // meaning 字段保留为"默认义项"（=senses[0] 的拼接），旧展示逻辑零破坏。
  senses?: Sense[]          // 全部义项（多义词才有，词书 AI 翻新/AI 生成时写入）
  selectedSenses?: number[] // 用户勾选要在弹窗显示的义项下标（限 3 个）；undefined=只显示默认义项
}
export type NewVocabItem = Omit<VocabItem, 'id' | 'created_at' | 'status' | 'book'> & {
  status?: VocabItem['status']
  book?: string | null
}

// 弹窗载荷：词条 + 连续答对进度（弹窗展示用）
export interface PopupPayload {
  item: VocabItem
  repetitions: number // 当前连续答对次数（显示时封顶到 passCount）
  passCount: number   // 过关所需次数
  forgotCount: number // 已累计"忘了"次数（弹窗展示"已忘 X 次"用）
  // —— 外观预览（设置页调滑块实时预览）——
  preview?: boolean          // 预览词（item.id=-1）：渲染端据此静音 + 显示"预览"徽标
  fontScaleOverride?: number // 预览拖动中的字体临时值（未提交设置）；卡片 zoom 优先用它
}

// 预览临时外观值（拖动中不写设置，松手才提交）。与 main/popup.ts PreviewOverrides 同构。
export interface PreviewOverrides {
  scale?: number
  opacity?: number
  fontScale?: number
}

// 词书词项（含"是否已在背诵库""是否在回收站"标记）
export interface WordbookWord {
  word: string; meaning: string; example: string; topic: string
  senses?: Sense[] // 多义项（AI 翻新后的词书数据；旧数据无此字段=单义项）
  inLibrary: boolean
  inTrash: boolean
}

// 回收站条目：被软删除的词 + 删除时间戳（listTrash 返回、前端 TrashView 渲染用）
export interface TrashEntry {
  item: VocabItem
  deletedAt: number
}

// A1 表达教练：三模式（写作优化/口语优化/中译英）
export type PolishMode = 'writing' | 'speaking' | 'translate'
// A1 优化结果：1-2 个版本 + 后验匹配到的"在学词"（高亮用；联动关时为空数组）
export interface PolishResult {
  versions: string[]
  usedWords: string[]
}

// 渲染端可调用的接口形状
export interface VocallApi {
  listVocab(): Promise<VocabItem[]>
  addVocab(e: NewVocabItem): Promise<number>
  // 批量添加：一次 IPC 整批入库，返回实际加入条数（撞库/回收站/批内重复已静默跳过）
  addVocabBatch(items: NewVocabItem[]): Promise<number>
  updateVocab(id: number, patch: Partial<NewVocabItem>): Promise<void>
  deleteVocab(id: number): Promise<void>
  // 回收站：列表（按 deletedAt 倒序）/还原/彻底删除/清空
  listTrash(): Promise<TrashEntry[]>
  restore(id: number): Promise<void>
  purge(id: number): Promise<void>
  clearTrash(): Promise<void>
  getSettings(): Promise<Record<string, string>>
  setSetting(key: string, value: string): Promise<void>
  // 恢复默认：只重置记忆节奏弹性数值键（learning_cap/pass_count/forgot_gap_pops/
  // fuzzy_gap_pops/learning_step_pops/review_steps_pops），外观/音效/AI 不动
  resetElasticSettings(): Promise<void>
  onShow(cb: (expr: VocabItem) => void): void
  // 真词显示时拖"弹窗字体"滑块的实时倍率消息（临时值，不提交设置）
  onFontScale(cb: (v: number) => void): void
  getCurrent(): Promise<PopupPayload | null>
  grade(id: number, grade: 0 | 1 | 2): Promise<void>
  dismiss(): void
  // 外观预览：设置页拖滑块实时预览弹窗。返回是否进入预览模式（真词正显示时 false=不换内容，
  // 但尺寸/透明度/字体临时值照样应用到真弹窗——拒换内容，不拒调外观）
  previewPopup(overrides?: PreviewOverrides): Promise<boolean>
  endPreview(): Promise<void> // 松手后调用：3s 后自动收起预览
  // 已掌握终态：背完不再弹；revive 让 mastered 词复活重背（直接进 learning 队列立即可弹）
  master(id: number): Promise<void>
  revive(id: number): Promise<void>
  // 各词忘词计数汇总（id→forgotCount，生词库列表"已忘 N"徽标用；缺省当 0）
  getForgotCounts(): Promise<Record<number, number>>
  testAi(): Promise<{ ok: boolean; message: string }>
  // AI 内容生产：主题词组生成（返回 [{word,meaning,example}] 预览，不入库）；n 默认 30
  generateTheme(theme: string, n?: number): Promise<{ word: string; meaning: string; example: string; senses?: Sense[] }[]>
  // 生词 AI 翻译（预览填入新增卡片）；senses=一词多义（可选，宽容降级）
  translate(word: string): Promise<{ meaning: string; example: string; senses?: Sense[] }>
  // A1 表达教练：句子优化/中译英。boost=true 时主进程取在学词软引导 + 后验高亮 usedWords
  polish(text: string, mode: PolishMode, boost: boolean): Promise<PolishResult>
  // 发音：返回 base64 data URL（data:audio/mpeg;base64,...）供渲染端 new Audio(dataURL).play()；失败 reject 由调用方 catch 静默
  pronounce(word: string): Promise<string>
  // 词书
  listWordbooks(): Promise<{ id: string; name: string; count: number; desc: string }[]>
  addWordbook(bookId: string): Promise<number>
  removeWordbook(bookId: string): Promise<number>
  getWordbookWords(bookId: string): Promise<WordbookWord[]>
  addWordsToPlan(bookId: string, words: string[]): Promise<number>
  // 整窗拖拽：fire-and-forget，参数为鼠标 screen 坐标
  dragStart(x: number, y: number): void
  dragMove(x: number, y: number): void
  // 自绘标题栏窗口控制（frame:false 后由渲染端按钮触发，作用于发送者所在窗口）
  winMinimize(): Promise<void>
  winMaximize(): Promise<void> // toggle：最大化/还原
  winClose(): Promise<void>    // 主进程拦截为"隐藏到托盘"，非真退
  // 版本/更新检查 + 外链跳转
  getVersion(): Promise<string>
  checkUpdate(): Promise<UpdateInfo>
  openExternal(url: string): Promise<void>
}

// 检查更新返回结构（updater.ts 产出，renderer 消费）
export interface UpdateInfo {
  current: string       // 本地版本
  latest: string | null // 远端最新版（去 v 前缀）；null = 未发布或拉取失败
  hasUpdate: boolean    // latest > current
  releaseUrl: string | null
  error?: string        // 失败原因
}

declare global {
  interface Window {
    vocall: VocallApi
  }
}
