/** Construção da restauração de NPC manual e arquivado, sem mexer nos IDs. */
import type { Character } from "./types"
import { readElementalSelection } from "./elemental-affinities"

export interface NurseryRestorationDraft {
  name: string
  origin: string
  identity: string
  theme: string
  classes: Character["classes"]
  skills: Character["skills"]
  attributes: Character["attributes"]
  equipment: Character["equipment"]
  npcModifiers?: Array<Record<string, unknown>>
  npcEquippedIds?: string[]
  archivedSnapshot?: Character
  resources?: Character["resources"]
  npcLevel?: number
  npcChecks?: Character["npcChecks"]
  customModifiers?: Array<Record<string, unknown>>
  bestiaryAffinities?: Character["bestiaryAffinities"]
}

export const DEFENSE_IDS = {
  physical: "sheet_defense:physical",
  magical: "sheet_defense:magical",
} as const

export function writeNurseryDefenses(
  mods: Array<Record<string, unknown>>, physical: number, magical: number,
): Array<Record<string, unknown>> {
  if (![physical, magical].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("As defesas precisam ser inteiros não negativos.")
  }
  return [
    ...mods.filter(mod => mod.id !== DEFENSE_IDS.physical && mod.id !== DEFENSE_IDS.magical),
    { id: DEFENSE_IDS.physical, name: "Defesa manual", target: "sheet_defense_hidden", value: physical },
    { id: DEFENSE_IDS.magical, name: "Defesa mágica manual", target: "sheet_defense_hidden", value: magical },
  ]
}

export function readNurseryDefense(mods: Array<Record<string, unknown>> | undefined, id: string, fallback: number): number {
  const value = mods?.find(mod => mod.id === id)?.value
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

/** Atributos, itens e defesa persistem também em NPCs criados manualmente. */
export function createNurseryRestorePatch(
  draft: NurseryRestorationDraft, archivedPatch: Record<string, unknown> | null,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    ...(archivedPatch ?? {}),
    name: draft.name,
    origin: draft.origin,
    identity: draft.identity,
    theme: draft.theme,
    classes: structuredClone(draft.classes),
    skills: structuredClone(draft.skills),
    attributes: structuredClone(draft.attributes),
    equipment: structuredClone(draft.equipment),
    ...(draft.resources !== undefined ? { resources: structuredClone(draft.resources) } : {}),
    ...(draft.npcLevel !== undefined ? { npcLevel: draft.npcLevel } : {}),
    ...(draft.npcChecks !== undefined ? { npcChecks: structuredClone(draft.npcChecks) } : {}),
    ...(draft.bestiaryAffinities !== undefined ? { bestiaryAffinities: structuredClone(draft.bestiaryAffinities) } : {}),
  }
  // Não substitui os outros modificadores (condições, bônus, equipamentos)
  // quando um NPC do acervo não foi editado neste campo.
  if (draft.npcModifiers !== undefined) patch.customModifiers = structuredClone(draft.npcModifiers)
  else if (draft.customModifiers !== undefined && patch.customModifiers === undefined) patch.customModifiers = structuredClone(draft.customModifiers)
  if (draft.npcEquippedIds !== undefined) {
    const prepared = [...new Set(draft.npcEquippedIds.filter(id => draft.equipment.includes(id)))]
    const modifiers = Array.isArray(patch.customModifiers) ? patch.customModifiers as Array<Record<string, unknown>> : []
    patch.customModifiers = [
      ...modifiers.filter(mod => typeof mod.id !== "string" || !mod.id.startsWith("item_equipped:")),
      ...prepared.map(id => ({ id: `item_equipped:${id}`, name: `Equipado: ${id}`, target: "item_state_hidden", value: 1 })),
    ]
    patch.npcEquippedIds = prepared
  }
  return patch
}

function equal(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])) : value
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

/** Confirma os campos editáveis, inclusive em NPCs antigos sem snapshot. */
export function nurseryRestorationFields(patch: Record<string, unknown>, restored: Character): string[] {
  const actual = restored as Character & Record<string, unknown>
  return ["name", "origin", "identity", "theme", "classes", "skills", "attributes", "equipment", "customModifiers"]
    .filter(key => {
      const comparable = (value: unknown) => key === "customModifiers" && Array.isArray(value)
        ? value.filter(mod => mod?.id !== "system:inventory-overweight").sort((a,b) => String(a.id).localeCompare(String(b.id))) : value
      return patch[key] !== undefined && !equal(comparable(patch[key]), comparable(actual[key]))
    })
}

/** Inspeciona o registro efetivamente gravado depois das rotas especializadas. */
export function missingNurseryExtras(
  draft: {
    specialAttacks?: unknown[]
    portraitLabel?: string
    portraitGallery?: unknown[]
    elementalAffinities?: unknown
  },
  restored: Character,
): string[] {
  const found: string[] = []
  const actual = restored as Character & Record<string, unknown>
  if (draft.portraitLabel !== undefined && draft.portraitLabel !== actual.portraitLabel) found.push("portraitLabel")
  if (draft.portraitGallery !== undefined && !equal(draft.portraitGallery, actual.portraitGallery ?? [])) found.push("portraitGallery")
  const meaningfulAttacks = (attacks: unknown): unknown[] => Array.isArray(attacks)
    ? attacks.map(attack => {
      if (!attack || typeof attack !== "object") return attack
      const { updatedAt: ignored, ...data } = attack as Record<string, unknown>
      return data
    }) : []
  if (draft.specialAttacks !== undefined && !equal(meaningfulAttacks(draft.specialAttacks), meaningfulAttacks(actual.specialAttacks))) {
    found.push("specialAttacks")
  }
  if (draft.elementalAffinities !== undefined &&
      !equal(readElementalSelection(draft.elementalAffinities), readElementalSelection(actual.elementalAffinities))) {
    found.push("elementalAffinities")
  }
  return found
}
