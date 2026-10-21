/**
 * Funções exclusivas do servidor para o modo "Aprendizado".
 * Nunca use este arquivo para montar a resposta das cartas bloqueadas:
 * envie apenas o resumo numérico para o jogador.
 */
import { randomInt } from "node:crypto"
import type { ClassBook, ClassBookEntry, ClassBookProgress } from "./class-books"
import { isCardAccessible } from "./class-books"

export interface BookLevelSummary {
  level: number
  /** Quantidade de cartas únicas publicadas; cópias de deck não duplicam a contagem. */
  total: number
  /** Quantas cartas publicadas podem ser consultadas pelo personagem agora. */
  unlocked: number
  /** Quantas cartas são elegíveis para gastar 1 LP no modo aprendizado. */
  available: number
}

/** Conjunto privado: não devolver IDs nem nomes de cartas candidatas no GET. */
export function learnableClassBookEntries(
  book: ClassBook,
  progress: ClassBookProgress,
  hasClassAccess: boolean,
  classLevel: number,
): ClassBookEntry[] {
  if (book.kind !== "spellbook" || book.unlockMode !== "learn" || !hasClassAccess ||
      !Number.isSafeInteger(classLevel) || classLevel < 1) return []
  const known = new Set(progress.granted[book.id] ?? [])
  const blocked = new Set(progress.denied?.[book.id] ?? [])
  return book.entries.filter((entry) =>
    entry.published === true &&
    (entry.requiredClassLevel ?? 1) <= classLevel &&
    !known.has(entry.id) && !blocked.has(entry.id),
  )
}

/** Executar sobre o livro COMPLETO no servidor, antes de filtrar entries com permittedBook. */
export function summarizeClassBookLevels(
  book: ClassBook,
  progress: ClassBookProgress,
  hasClassAccess: boolean,
  classLevel: number,
): BookLevelSummary[] {
  const groups = new Map<number, BookLevelSummary>()
  const eligibleIds = new Set(learnableClassBookEntries(book, progress, hasClassAccess, classLevel).map(entry => entry.id))
  for (const entry of book.entries) {
    if (!entry.published) continue // Cartas em rascunho não são anunciadas.
    const level = entry.requiredClassLevel ?? 1
    const row = groups.get(level) ?? { level, total: 0, unlocked: 0, available: 0 }
    row.total += 1
    if (isCardAccessible(book, entry, progress, hasClassAccess, classLevel)) row.unlocked += 1
    if (eligibleIds.has(entry.id)) row.available += 1
    groups.set(level, row)
  }
  return [...groups.values()].sort((a, b) => a.level - b.level)
}

export interface PreparedLearning {
  entryId: string
  nextProgress: ClassBookProgress
  nextLorePoints: number
}

/**
 * Decisão de domínio. O chamador precisa executá-la sob trava ou transação
 * MongoDB atômica junto com o débito na ficha, após autorizar o jogador.
 * Para evitar uma segunda cobrança em retransmissões, verificar requestId
 * persistido ANTES de chamar esta função.
 */
export function prepareClassBookLearning({ book, progress, hasClassAccess, classLevel, lorePoints }: {
  book: ClassBook
  progress: ClassBookProgress
  hasClassAccess: boolean
  classLevel: number
  lorePoints: number
}): PreparedLearning {
  if (book.kind !== "spellbook" || book.unlockMode !== "learn")
    throw new Error("Este grimório não utiliza o método Aprendizado.")
  if (!hasClassAccess || !Number.isSafeInteger(classLevel) || classLevel < 1)
    throw new Error("A classe do grimório não está disponível para o personagem.")
  if (!Number.isSafeInteger(lorePoints) || lorePoints < 1)
    throw new Error("Você precisa de pelo menos 1 Ponto de Lore.")
  const candidates = learnableClassBookEntries(book, progress, hasClassAccess, classLevel)
  if (candidates.length === 0)
    throw new Error("Não há novas cartas liberadas para aprender neste nível.")
  const selected = candidates[randomInt(candidates.length)]
  return {
    entryId: selected.id,
    nextLorePoints: lorePoints - 1,
    nextProgress: {
      ...progress,
      granted: {
        ...progress.granted,
        [book.id]: [...(progress.granted[book.id] ?? []), selected.id],
      },
    },
  }
}
