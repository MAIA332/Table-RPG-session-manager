import type { GameClass } from "@/lib/game-data"
import { isClassPublished } from "@/lib/class-visibility"

/**
 * Publicação por conta OU por personagem. As duas listas são unidas (OR).
 * Compatibilidade: ambas ausentes/null + playerVisible = público para todos.
 * Listas vazias não são equivalentes a null: significam audiência restrita.
 */
export type ClassAudience = GameClass & {
  allowedPlayerIds?: string[] | null
  allowedCharacterIds?: string[] | null
  playerVisible?: boolean
}

function audienceIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((id): id is string => typeof id === "string" && Boolean(id))
}

export function allowedPlayerIds(cls: GameClass): string[] | null {
  return audienceIds((cls as ClassAudience).allowedPlayerIds)
}

export function allowedCharacterIds(cls: GameClass): string[] | null {
  return audienceIds((cls as ClassAudience).allowedCharacterIds)
}

/** Uma permissão de personagem NUNCA libera todas as fichas do dono. */
export function isClassVisibleToUser(cls: GameClass, userId: string, characterId?: string): boolean {
  if (!userId || !isClassPublished(cls)) return false
  const players = allowedPlayerIds(cls)
  const characters = allowedCharacterIds(cls)
  if (players === null && characters === null) return true
  return Boolean(players?.includes(userId) || (characterId && characters?.includes(characterId)))
}

/** Para cada usuário, somente definições publicadas para sua conta/ficha. */
export function visibleCustomClassesForUser<T extends GameClass>(
  definitions: readonly T[], userId: string, isGm = false, characterId?: string,
): T[] {
  return isGm ? [...definitions] : definitions.filter(cls => isClassVisibleToUser(cls, userId, characterId))
}

/** Definição do sistema ou homebrew autorizada para esta conta/ficha. */
export function canViewClassDefinition(
  classId: string, systemIds: ReadonlySet<string>, definitions: readonly GameClass[],
  userId: string, isGm = false, characterId?: string,
): boolean {
  if (isGm) return true
  const customized = definitions.find(cls => cls.id === classId)
  if (customized) return isClassVisibleToUser(customized, userId, characterId)
  return systemIds.has(classId)
}

/** Evita permissões para IDs externos à campanha, duplicados ou inválidos. */
export function validateClassAudiences(
  definitions: readonly unknown[], memberUserIds: ReadonlySet<string>, campaignCharacterIds: ReadonlySet<string> = new Set(),
): string | null {
  for (const value of definitions) {
    if (!value || typeof value !== "object") continue
    const cls = value as Record<string, unknown>
    const name = String(cls.name || cls.id || "sem nome")
    for (const [key, authorized] of [
      ["allowedPlayerIds", memberUserIds],
      ["allowedCharacterIds", campaignCharacterIds],
    ] as const) {
      const audience = cls[key]
      if (audience === undefined || audience === null) continue
      if (!Array.isArray(audience) || audience.length > 300 ||
        audience.some(id => typeof id !== "string" || !authorized.has(id)) ||
        new Set(audience).size !== audience.length) {
        return `Destinatários inválidos na classe ${name}. Selecione somente jogadores ou personagens desta campanha.`
      }
    }
    const players = cls.allowedPlayerIds
    const characters = cls.allowedCharacterIds
    const restricted = Array.isArray(players) || Array.isArray(characters)
    if (cls.playerVisible === true && restricted &&
      (!Array.isArray(players) || players.length === 0) &&
      (!Array.isArray(characters) || characters.length === 0)) {
      return `A classe ${name} está restrita, mas não tem jogadores nem personagens selecionados.`
    }
  }
  return null
}
