import { allocId, expressionsBox, setSrsState, deleteSrsState } from './store'

export interface Expression {
  id: number; plain: string; advanced: string; example: string
  topic: string | null; source: string; created_at: number
}
export type NewExpression = Omit<Expression, 'id' | 'created_at'>

export function addExpression(e: NewExpression): Expression {
  const expr: Expression = { ...e, id: allocId(), created_at: Date.now() }
  expressionsBox.set([...expressionsBox.get(), expr])
  setSrsState(expr.id, {
    easiness: 2.5, interval: 0, repetitions: 0,
    due_at: Date.now(), last_reviewed: null,
  })
  return expr
}

export function listExpressions(): Expression[] {
  return [...expressionsBox.get()].sort((a, b) => a.id - b.id)
}

export function updateExpression(id: number, patch: Partial<NewExpression>): void {
  expressionsBox.set(
    expressionsBox.get().map(e => (e.id === id ? { ...e, ...patch } : e))
  )
}

export function deleteExpression(id: number): void {
  expressionsBox.set(expressionsBox.get().filter(e => e.id !== id))
  deleteSrsState(id)
}
