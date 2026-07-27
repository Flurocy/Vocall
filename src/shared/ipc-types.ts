export interface VocabItem {
  id: number; word: string; meaning: string; example: string
  topic: string | null
  book: string | null                   // 来源词书 id；手动/种子词为 null
  status: 'new' | 'learning' | 'review' // 生命周期三态
  source: string; created_at: number
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
}

// 渲染端可调用的接口形状
export interface TasymizeApi {
  listVocab(): Promise<VocabItem[]>
  addVocab(e: NewVocabItem): Promise<number>
  updateVocab(id: number, patch: Partial<NewVocabItem>): Promise<void>
  deleteVocab(id: number): Promise<void>
  getSettings(): Promise<Record<string, string>>
  setSetting(key: string, value: string): Promise<void>
  onShow(cb: (expr: VocabItem) => void): void
  getCurrent(): Promise<PopupPayload | null>
  grade(id: number, grade: 0 | 1 | 2): Promise<void>
  dismiss(): void
  testAi(): Promise<{ ok: boolean; message: string }>
  // 整窗拖拽：fire-and-forget，参数为鼠标 screen 坐标
  dragStart(x: number, y: number): void
  dragMove(x: number, y: number): void
  // 自绘标题栏窗口控制（frame:false 后由渲染端按钮触发，作用于发送者所在窗口）
  winMinimize(): Promise<void>
  winMaximize(): Promise<void> // toggle：最大化/还原
  winClose(): Promise<void>    // 主进程拦截为"隐藏到托盘"，非真退
}

declare global {
  interface Window {
    tasymize: TasymizeApi
  }
}
