import type { Character } from "./types"

export interface ArchivedNpcDraft {
  name: string
  avatarUrl: string
  origin: string
  identity: string
  theme: string
  classes: Character["classes"]
  skills: Character["skills"]
  attributes: Character["attributes"]
  equipment: Character["equipment"]
  archivedSnapshot?: Character
  archivedAt?: number
}

/** Copia os dados, em vez de manter referências à ficha que ainda está ativa. */
export function captureArchivedCharacter(character: Character): Character {
  const snapshot = structuredClone(character)
  // O retrato (frequentemente base64 com vários MB) já está em NPCDraft.avatarUrl.
  // Evita duplicá-lo no mesmo documento MongoDB; a invocação o repõe pelo draft.
  snapshot.avatarUrl = ""
  return snapshot
}

/** Efeitos com tempo de duração ficam pausados durante o arquivamento. */
function resumeModifiers(value: unknown, archivedAt?: number, now = Date.now()): unknown {
  if (!Array.isArray(value)) return value
  if (!Number.isFinite(archivedAt) || (archivedAt ?? 0) <= 0) return structuredClone(value)
  const elapsed = Math.max(0, now - archivedAt!)
  return value.map(modifier => {
    if (!modifier || typeof modifier !== "object") return modifier
    const source = modifier as Record<string, unknown>
    const expiresAt = source.expiresAt
    if (typeof expiresAt !== "number" || expiresAt <= archivedAt!) return structuredClone(source)
    const next = structuredClone(source)
    next.expiresAt = expiresAt + elapsed
    for (const key of ["startedAt", "activatedAt"]) {
      if (typeof source[key] === "number") next[key] = (source[key] as number) + elapsed
    }
    return next
  })
}

/** Os campos básicos refletem eventuais edições no Berçário. */
export function buildArchivedNpcPatch(draft: ArchivedNpcDraft, now = Date.now()): Record<string, unknown> | null {
  const source = draft.archivedSnapshot
  if (!source) return null // NPC manual antigo: mantém o fluxo anterior.
  const patch: Record<string, unknown> = {
    name: draft.name,
    origin: draft.origin,
    identity: draft.identity,
    theme: draft.theme,
    classes: structuredClone(draft.classes),
    skills: structuredClone(draft.skills),
    attributes: structuredClone(draft.attributes),
    equipment: structuredClone(draft.equipment),
    resources: structuredClone(source.resources),
  }

  if (draft.avatarUrl) patch.avatarUrl = draft.avatarUrl
  if (source.portraitFrame !== undefined) patch.portraitFrame = source.portraitFrame
  if (source.portraitCrop !== undefined) patch.portraitCrop = structuredClone(source.portraitCrop)
  if (source.zenit !== undefined) patch.zenit = source.zenit
  const extended = source as Character & { customModifiers?: unknown; customItems?: unknown }
  const legacyBonds = Array.isArray(source.bonds) ? source.bonds : []
  if (extended.customModifiers !== undefined || legacyBonds.length > 0) {
    const resumed = resumeModifiers(extended.customModifiers ?? [], draft.archivedAt, now)
    const modifiers: Record<string, unknown>[] = Array.isArray(resumed) ? resumed : []

    // A API PATCH persiste Laços em customModifiers. O campo raiz bonds é
    // legado e não é salvo pela rota: converte sem perder nem duplicar Laços.
    for (const [index, bond] of legacyBonds.entries()) {
      const bondId = bond.id || `archived_bond_${index}`
      const alreadyStored = modifiers.some(mod => mod?.type === "bond" && (
        mod.id === bondId || (!bond.id && (
          mod.bondTarget === bond.target &&
          mod.bondType === bond.type &&
          mod.value === bond.value
        ))
      ))
      if (!alreadyStored) {
        modifiers.push({
          id: bondId,
          name: `Laço: ${bond.target}`,
          target: "bond_hidden",
          bondTarget: bond.target,
          bondType: bond.type,
          value: bond.value,
          type: "bond",
        })
      }
    }
    patch.customModifiers = modifiers
  }
  if (extended.customItems !== undefined) patch.customItems = structuredClone(extended.customItems)
  return patch
}

function canonical(value: unknown): string {
  const sorted = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sorted)
    if (entry && typeof entry === "object") {
      const result: Record<string, unknown> = {}
      for (const key of Object.keys(entry).sort()) {
        const field = (entry as Record<string, unknown>)[key]
        if (field !== undefined) result[key] = sorted(field)
      }
      return result
    }
    return entry
  }
  return JSON.stringify(sorted(value)) ?? "undefined"
}

/** Nunca anuncia sucesso se a API ignorou itens, condições ou recursos. */
export function missingRestoredFields(
  draft: ArchivedNpcDraft,
  restored: Character,
  patch: Record<string, unknown>,
): string[] {
  const source = draft.archivedSnapshot
  if (!source) return []
  const immutable = new Set(["id", "ownerId", "campaignId", "createdAt", "updatedAt"])
  const expected: Record<string, unknown> = { ...source, ...patch }
  if (draft.avatarUrl) expected.avatarUrl = draft.avatarUrl
  else delete expected.avatarUrl // O servidor pode aplicar o retrato padrão.
  const actual = restored as Character & Record<string, unknown>
  const missing: string[] = []

  for (const key of Object.keys(expected)) {
    if (immutable.has(key)) continue
    // Laços legados foram migrados para customModifiers (comparados abaixo).
    // Não exigimos que a API volte a gravar também o campo raiz obsoleto.
    if (key === "bonds") continue
    if (key === "resources") {
      const saved = actual.resources as any
      const resource = expected.resources as Record<string, unknown> | undefined
      for (const resourceKey of Object.keys(resource ?? {})) {
        // Peso ocupado é calculado pelo inventário, não enviado no PATCH.
        if (resourceKey === "ip") continue
        if (canonical(resource?.[resourceKey]) !== canonical(saved?.[resourceKey])) {
          missing.push(`resources.${resourceKey}`)
        }
      }
      continue
    }
    if (canonical(expected[key]) !== canonical(actual[key])) missing.push(key)
  }
  return missing
}
