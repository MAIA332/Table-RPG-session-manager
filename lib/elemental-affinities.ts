/**
 * Typedex elemental de Morte Mágica.
 * A linha OFENSIVA (elemento atacante -> elemento defensor) é a fonte de verdade.
 * Pares não declarados são sempre 1x, independente do estágio defensivo.
 * Não converta a tabela defensiva em outra matriz: o texto fornecido contém
 * divergências entre as duas perspectivas.
 */
export const ELEMENTS = [
  "fisico", "ar", "raio", "trevas", "terra", "fogo", "gelo", "luz",
  "veneno", "mental", "agua", "sangue", "arcano", "som", "espiritual",
] as const
export type ElementId = typeof ELEMENTS[number]
export type AffinityRank = "principal" | "secundaria" | "complementar"
export type ElementalAffinitySelection = {
  primary: ElementId | null
  secondary: ElementId | null
  /** true após confirmação; desbloquear uma nova alteração custa 1 Lore. */
  locked: boolean
}
export type ElementalAffinityCharacter = {
  elementalAffinities?: Partial<ElementalAffinitySelection>
}

export const ELEMENT_NAMES: Record<ElementId, string> = {
  fisico: "Físico", ar: "Ar", raio: "Raio", trevas: "Trevas", terra: "Terra",
  fogo: "Fogo", gelo: "Gelo", luz: "Luz", veneno: "Veneno", mental: "Mental",
  agua: "Água", sangue: "Sangue", arcano: "Arcano", som: "Som", espiritual: "Espiritual",
}
export const AFFINITY_LEVELS = [
  { level: 0, name: "Fraqueza", multiplier: 2 },
  { level: 1, name: "Vulnerável", multiplier: 1.5 },
  { level: 2, name: "Normal", multiplier: 1 },
  { level: 3, name: "Resistente", multiplier: 0.5 },
  { level: 4, name: "Absorve", multiplier: 0.2 },
  { level: 5, name: "Imune", multiplier: 0 },
] as const

// Declarar SOMENTE ataques que divergem de 1x. Colunas são elementos defensores.
const ROWS: Record<ElementId, Partial<Record<ElementId, number>>> = {
  fisico: { sangue: 1.5, arcano: 1.5, terra: .5, gelo: .5, mental: .5, espiritual: 0 },
  ar: { som: 2, fogo: 1.5, agua: 1.5, terra: .5, gelo: .5, raio: .5 },
  raio: { agua: 2, ar: 2, fisico: 1.5, sangue: 1.5, terra: 0 },
  trevas: { luz: 2, mental: 1.5, espiritual: 1.5, arcano: .5 },
  terra: { raio: 2, fogo: 1.5, veneno: 1.5, fisico: 1.5, ar: .5, agua: .5, gelo: .5 },
  fogo: { gelo: 2, terra: 1.5, sangue: 1.5, veneno: 1.5, agua: .5, ar: .5 },
  gelo: { agua: 2, terra: 1.5, sangue: 1.5, ar: 1.5, fogo: .5, som: .5 },
  luz: { trevas: 2, sangue: 1.5, espiritual: 1.5, arcano: .5 },
  veneno: { fisico: 2, agua: 1.5, sangue: 1.5, terra: .5, gelo: .5, fogo: .5, espiritual: 0 },
  mental: { arcano: 2, fisico: 1.5, sangue: 1.5, som: 1.5, trevas: .5, espiritual: .5 },
  agua: { fogo: 2, terra: 2, som: 1.5, gelo: .5, raio: .5, ar: .5 },
  sangue: { fisico: 2, agua: 1.5, mental: 1.5, gelo: .5, fogo: .5, veneno: .5, espiritual: 0 },
  arcano: { espiritual: 2, fisico: 1.5, trevas: 1.5, luz: 1.5, mental: .5 },
  som: { gelo: 2, mental: 2, terra: 1.5, luz: 1.5, ar: .5, agua: .5 },
  espiritual: { fisico: 2, trevas: 1.5, mental: 1.5, luz: .5, arcano: .5 },
}

export function elementId(value: unknown): ElementId | null {
  if (typeof value !== "string") return null
  const key = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const aliases: Record<string, ElementId> = {
    physical: "fisico", fisico: "fisico", fis: "fisico", air: "ar", ar: "ar",
    bolt: "raio", lightning: "raio", rai: "raio", raio: "raio",
    dark: "trevas", tre: "trevas", trevas: "trevas",
    earth: "terra", ter: "terra", terra: "terra", fire: "fogo", fog: "fogo", fogo: "fogo",
    ice: "gelo", gel: "gelo", gelo: "gelo", light: "luz", luz: "luz",
    poison: "veneno", ven: "veneno", veneno: "veneno", psychic: "mental", men: "mental", mental: "mental",
    water: "agua", agu: "agua", agua: "agua", blood: "sangue", san: "sangue", sangue: "sangue",
    arcane: "arcano", arc: "arcano", arcano: "arcano", sound: "som", som: "som",
    spiritual: "espiritual", spirit: "espiritual", esp: "espiritual", espiritual: "espiritual",
  }
  return aliases[key] ?? null
}

/**
 * Cada classe oficial declara sua affinity em game-data.ts.
 * As classes criadas pelo Mestre usam a affinity salva no cadastro;
 * classes antigas sem essa propriedade são Físico.
 * Jamais inferir a afinidade pelo nome, ID ou arquétipo.
 */
export function classElement(cls: { affinity?: unknown; element?: unknown }): ElementId {
  return elementId(cls.affinity ?? cls.element) ?? "fisico"
}

export function availableClassElements(classes: readonly { id?: string; name?: string; affinity?: unknown; element?: unknown }[]) {
  return [...new Set(classes.map(classElement))] as ElementId[]
}

export function readElementalSelection(value: unknown): ElementalAffinitySelection {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const primary = elementId(source.primary)
  const secondary = elementId(source.secondary)
  return {
    primary,
    secondary: secondary && secondary !== primary ? secondary : null,
    locked: source.locked === true,
  }
}

export function tieredElements(options: readonly ElementId[], value: unknown) {
  const current = readElementalSelection(value)
  const present = new Set(options)
  const primary = current.primary && present.has(current.primary) ? current.primary : null
  const secondary = current.secondary && present.has(current.secondary) && current.secondary !== primary ? current.secondary : null
  return {
    primary,
    secondary,
    complementary: options.filter(element => element !== primary && element !== secondary),
  }
}

/** Multiplicador DEFENSIVO. A matriz do atacante é a fonte de verdade. */
export function effectiveness(attacker: unknown, defender: unknown, rank: AffinityRank = "principal") {
  const atk = elementId(attacker)
  const def = elementId(defender)
  if (!atk || !def) return { multiplier: 1, level: 2, specified: false }
  const base = ROWS[atk][def]
  if (base === undefined) return { multiplier: 1, level: 2, specified: false }
  const baseLevel = AFFINITY_LEVELS.findIndex(entry => entry.multiplier === base)
  const offset = rank === "principal" ? 0 : rank === "secundaria" ? 1 : 2
  const level = Math.min(5, baseLevel + offset)
  return { multiplier: AFFINITY_LEVELS[level].multiplier, level, specified: true }
}

/** Primeira afinidade relevante na ordem principal -> secundária -> complementares. */
export function characterEffectiveness(attacker: unknown, options: readonly ElementId[], selection: unknown) {
  const tiers = tieredElements(options, selection)
  // Fichas legadas e ainda não configuradas são sempre neutras (1x).
  if (!tiers.primary && !tiers.secondary)
    return { multiplier: 1, level: 2, specified: false, element: null, rank: null }
  const candidates: Array<{ element: ElementId; rank: AffinityRank }> = [
    ...(tiers.primary ? [{ element: tiers.primary, rank: "principal" as const }] : []),
    ...(tiers.secondary ? [{ element: tiers.secondary, rank: "secundaria" as const }] : []),
    ...tiers.complementary.map(element => ({ element, rank: "complementar" as const })),
  ]
  for (const candidate of candidates) {
    const result = effectiveness(attacker, candidate.element, candidate.rank)
    if (result.specified) return { ...result, ...candidate }
  }
  return { multiplier: 1, level: 2, specified: false, element: null, rank: null }
}

export function affinityDamageAmount(baseDamage: number, multiplier: number): number {
  // O dano permanece inteiro e não cria cura por "Absorve" (0,2x conforme tabela).
  if (!Number.isFinite(baseDamage) || baseDamage <= 0) return 0
  return Math.max(0, Math.floor(baseDamage * multiplier))
}
