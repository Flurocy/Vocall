import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { addVocab, listVocab, deleteVocab } from './vocab'

// 词书：预生成的 JSON 词表（data/wordbooks/*.json），加入学习计划即批量进 new 状态。
// 词书是"往词库添词的一种方式"——词进了 new 就交给学习队列补位机制统一管理，无特殊待遇。

export interface WordbookMeta { id: string; name: string; count: number; desc: string }
interface WordbookFile {
  id: string; name: string; desc: string
  words: { word: string; meaning: string; example: string; topic: string }[]
}

function booksDir(): string {
  return join(process.cwd(), 'data', 'wordbooks')
}

function readBook(file: string): WordbookFile {
  return JSON.parse(readFileSync(join(booksDir(), file), 'utf-8')) as WordbookFile
}

function allBooks(): WordbookFile[] {
  try {
    return readdirSync(booksDir()).filter((f) => f.endsWith('.json')).map(readBook)
  } catch {
    return [] // 目录缺失/读取失败时返回空，不炸
  }
}

export function listWordbooks(): WordbookMeta[] {
  return allBooks().map((b) => ({ id: b.id, name: b.name, count: b.words.length, desc: b.desc }))
}

// 加入学习计划：该书的词以 status=new、book=词书id 入库（不立即弹，靠补位机制逐个解锁）。
// 重复加入返回 0（库里已有该书的词即视为已加入）。
export function addWordbookToPlan(bookId: string): number {
  const book = allBooks().find((b) => b.id === bookId)
  if (!book) return 0
  if (listVocab().some((v) => v.book === bookId)) return 0
  for (const w of book.words) {
    addVocab({ ...w, book: bookId, status: 'new', source: '词书' })
  }
  return book.words.length
}

// 移出学习计划：只删该书仍处 new 的词；learning/review 中的保留（用户已在学，不能丢）。
export function removeWordbookFromPlan(bookId: string): number {
  const toDelete = listVocab().filter((v) => v.book === bookId && v.status === 'new')
  for (const v of toDelete) deleteVocab(v.id)
  return toDelete.length
}

// —— 批量勾选加入（用户决策：词书是预置词库，从里面挑词加入，而非整本接收）——

export interface WordbookWord {
  word: string; meaning: string; example: string; topic: string
  inLibrary: boolean // 该词是否已在背诵库（同书内），前端据此标记/禁选
}

// 返回某本词书的全部词 + 每个词是否已在背诵库（按 word 匹配，限同书）。
export function getWordbookWords(bookId: string): WordbookWord[] {
  const book = allBooks().find((b) => b.id === bookId)
  if (!book) return []
  const inLib = new Set(listVocab().filter((v) => v.book === bookId).map((v) => v.word))
  return book.words.map((w) => ({ ...w, inLibrary: inLib.has(w.word) }))
}

// 批量把勾选的词加入背诵库（status=new、book=词书id）。已在库的（同书同 word）跳过。
// 返回实际新加入的条数。
export function addWordsToPlan(bookId: string, words: string[]): number {
  const book = allBooks().find((b) => b.id === bookId)
  if (!book) return 0
  const inLib = new Set(listVocab().filter((v) => v.book === bookId).map((v) => v.word))
  const wanted = new Set(words)
  let added = 0
  for (const w of book.words) {
    if (!wanted.has(w.word) || inLib.has(w.word)) continue
    addVocab({ ...w, book: bookId, status: 'new', source: '词书' })
    added++
  }
  return added
}
