export interface Expression {
  id: number; plain: string; advanced: string; example: string
  topic: string | null; source: string; created_at: number
}
export type NewExpression = Omit<Expression, 'id' | 'created_at'>

// 渲染端可调用的接口形状
export interface TasymizeApi {
  listExpressions(): Promise<Expression[]>
  addExpression(e: NewExpression): Promise<number>
  updateExpression(id: number, patch: Partial<NewExpression>): Promise<void>
  deleteExpression(id: number): Promise<void>
  getSettings(): Promise<Record<string, string>>
  setSetting(key: string, value: string): Promise<void>
  onShow(cb: (expr: Expression) => void): void
  grade(id: number, grade: 0 | 1 | 2): Promise<void>
  dismiss(): void
}

declare global {
  interface Window {
    tasymize: TasymizeApi
  }
}
