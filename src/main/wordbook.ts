import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { addVocabBatch, listVocab, hardDeleteVocab } from './vocab'
import type { Sense } from '../shared/ipc-types'
import { trashBox } from './store'
import { resolveResource } from './paths'

// 词书：预生成的 JSON 词表（data/wordbooks/*.json），加入学习计划即批量进 new 状态。
// 词书是"往词库添词的一种方式"——词进了 new 就交给学习队列补位机制统一管理，无特殊待遇。

export interface WordbookMeta { id: string; name: string; count: number; desc: string }
interface WordbookFile {
  id: string; name: string; desc: string
  words: { word: string; meaning: string; example: string; topic: string; senses?: Sense[] }[]
}

function booksDir(): string {
  return resolveResource('data', 'wordbooks')
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
// 单条撞词（与用户手动词/回收站词重复）→ 批量版静默跳过该词不中断整批，保留用户那条；返回实际新加入条数。
// 走 addVocabBatch：整本数百词内存组装 + 三次写盘，避免逐词各写三次全量导致的卡顿。
export function addWordbookToPlan(bookId: string): number {
  const book = allBooks().find((b) => b.id === bookId)
  if (!book) return 0
  if (listVocab().some((v) => v.book === bookId)) return 0
  return addVocabBatch(book.words.map((w) => ({ ...w, book: bookId, status: 'new' as const, source: '词书' })))
}

// 移出学习计划：只删该书仍处 new 的词；learning/review 中的保留（用户已在学，不能丢）。
// 走硬删除（不进回收站）——整本移除是用户主动批量操作，非误删；且重加时 inLib 去重只扫 vocab，
// 若软删进 trash 会让重加判定为未入库→重复入库。
export function removeWordbookFromPlan(bookId: string): number {
  const toDelete = listVocab().filter((v) => v.book === bookId && v.status === 'new')
  for (const v of toDelete) hardDeleteVocab(v.id)
  return toDelete.length
}

// —— 批量勾选加入（用户决策：词书是预置词库，从里面挑词加入，而非整本接收）——

export interface WordbookWord {
  word: string; meaning: string; example: string; topic: string
  inLibrary: boolean // 该词是否已在背诵库（全库归一化比对，不限同书），前端据此标记/禁选
  inTrash: boolean   // 该词是否在回收站，前端标 rose"回收站"并禁选，引导用户去回收站主动处理
}

// 返回某本词书的全部词 + 每个词的在库/在回收站标记（均按 word 归一化扫全库，不限同书）。
export function getWordbookWords(bookId: string): WordbookWord[] {
  const book = allBooks().find((b) => b.id === bookId)
  if (!book) return []
  // 修复"同书盲区"：原来只扫同书 vocab，会让"已在其它书/手动加入/在回收站"的词显示为可加入，
  // 但 addVocab 实际会拦截。改全库归一化扫，前端标记与 addVocab 行为一致。
  const norm = (s: string) => s.trim().toLowerCase()
  const inLib = new Set(listVocab().map((v) => norm(v.word)))
  const inTrash = new Set(trashBox.get().map((t) => norm(t.item.word)))
  return book.words.map((w) => ({
    ...w,
    inLibrary: inLib.has(norm(w.word)),
    inTrash: inTrash.has(norm(w.word)),
  }))
}

// 批量把勾选的词加入背诵库（status=new、book=词书id）。
// 已在库 / 在回收站的词跳过（与 getWordbookWords 标记一致，避免前端禁选的词仍被尝试加入）。
// 与用户手动词撞车的单条也跳过不中断整批（保留用户那条）。返回实际新加入的条数。
// 走 addVocabBatch：内存组装 + 三次写盘，修"导入 200 词低配机卡顿"。
export function addWordsToPlan(bookId: string, words: string[]): number {
  const book = allBooks().find((b) => b.id === bookId)
  if (!book) return 0
  // 与 getWordbookWords 一致：全库归一化扫，避免前端禁选的词仍被尝试加入
  const wanted = new Set(words)
  const toAdd = book.words.filter((w) => wanted.has(w.word))
  return addVocabBatch(toAdd.map((w) => ({ ...w, book: bookId, status: 'new' as const, source: '词书' })))
}
