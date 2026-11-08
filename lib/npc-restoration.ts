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
  }
  // Não substitui os outros modificadores (condições, bônus, equipamentos)
  // quando um NPC do acervo não foi editado neste campo.
  if (draft.npcModifiers !== undefined) patch.customModifiers = structuredClone(draft.npcModifiers)
  return patch
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Confirma os campos editáveis, inclusive em NPCs antigos sem snapshot. */
export function nurseryRestorationFields(patch: Record<string, unknown>, restored: Character): string[] {
  const actual = restored as Character & Record<string, unknown>
  return ["name", "origin", "identity", "theme", "classes", "skills", "attributes", "equipment", "customModifiers"]
    .filter(key => patch[key] !== undefined && !equal(patch[key], actual[key]))
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
