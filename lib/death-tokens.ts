/**
 * Tokens de morte pertencem a uma conta dentro de uma campanha, nunca a uma ficha.
 * Este arquivo contém apenas tipos e validações compartilháveis; acesso ao banco é servidor.
 */
export const DEFAULT_CREATION_LEVELS = 5
export const MAX_DEATH_TOKEN_LEVELS = 100
export const MAX_DEATH_TOKEN_ZENIT = 1_000_000
export const MAX_DEATH_TOKEN_ITEMS = 40
export const MAX_DEATH_TOKEN_CLASSES = 80
export const MAX_DEATH_TOKEN_RELICS = 10

export interface DeathTokenRelic {
  name: string
  content: string
  weight: number
  weightUnit: "g" | "kg"
}

export interface DeathTokenBenefits {
  maxLevels: number
  startingZenit: number
  /** Itens gratuitos colocados na mochila no nascimento da ficha. */
  startingItemIds: string[]
  /** Relíquias inéditas escritas pelo Mestre exclusivamente para esta criação. */
  startingRelics: DeathTokenRelic[]
  /** Vazio = todas as classes publicadas. Preenchido = seleção exclusiva do Mestre. */
  allowedClassIds: string[]
}

export interface DeathToken extends DeathTokenBenefits {
  id: string
  userId: string
  campaignId: string
  createdAt: number
  issuedBy: string
  status: "available" | "used" | "revoked"
  usedAt?: number
  usedCharacterId?: string
  revokedAt?: number
}

export function cleanDeathTokenBenefits(value: unknown): DeathTokenBenefits {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Configuração do token inválida.")
  const raw = value as Record<string, unknown>
  const maxLevels = Number(raw.maxLevels)
  const startingZenit = Number(raw.startingZenit)
  if (!Number.isSafeInteger(maxLevels) || maxLevels < 1 || maxLevels > MAX_DEATH_TOKEN_LEVELS)
    throw new Error(`Níveis devem estar entre 1 e ${MAX_DEATH_TOKEN_LEVELS}.`)
  if (!Number.isSafeInteger(startingZenit) || startingZenit < 0 || startingZenit > MAX_DEATH_TOKEN_ZENIT)
    throw new Error(`Zenits devem estar entre 0 e ${MAX_DEATH_TOKEN_ZENIT}.`)
  const ids = (input: unknown, limit: number, label: string): string[] => {
    if (!Array.isArray(input) || input.length > limit ||
      input.some(id => typeof id !== "string" || !id.trim() || id.length > 160))
      throw new Error(`${label} inválidos (máximo ${limit}).`)
    return [...new Set(input.map(id => String(id).trim()))]
  }
  return {
    maxLevels,
    startingZenit,
    startingItemIds: ids(raw.startingItemIds ?? [], MAX_DEATH_TOKEN_ITEMS, "Itens iniciais"),
    startingRelics: (() => {
      if (!Array.isArray(raw.startingRelics ?? []) || (raw.startingRelics as unknown[]).length > MAX_DEATH_TOKEN_RELICS)
        throw new Error(`Relíquias inválidas (máximo ${MAX_DEATH_TOKEN_RELICS}).`)
      return (raw.startingRelics as unknown[] | undefined || []).map((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Relíquia inválida.")
        const relic = item as Record<string, unknown>
        const name = String(relic.name || "").trim()
        const content = String(relic.content || "").trim()
        const weight = Number(relic.weight)
        if (!name || name.length > 100 || !content || content.length > 5000 ||
          !Number.isFinite(weight) || weight < 0 || weight > 100000 ||
          !["g", "kg"].includes(String(relic.weightUnit))) throw new Error("Nome, descrição ou peso de relíquia inválido.")
        return { name, content, weight, weightUnit: relic.weightUnit as "g" | "kg" }
      })
    })(),
    allowedClassIds: ids(raw.allowedClassIds ?? [], MAX_DEATH_TOKEN_CLASSES, "Classes iniciais"),
  }
}

export function availableDeathTokens(items: readonly DeathToken[], userId: string) {
  return items.filter(token => token.userId === userId && token.status === "available")
}
