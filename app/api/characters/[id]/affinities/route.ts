import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getCampaignClassCatalog } from "@/lib/class-catalog"
import { getMemberRole, publish, store, transactStore } from "@/lib/store"
import type { Character, RealtimeEvent } from "@/lib/types"
import { CLASSES, type GameClass } from "@/lib/game-data"
import {
  availableClassElements, elementId, readElementalSelection, type ElementalAffinitySelection,
} from "@/lib/elemental-affinities"

type RouteContext = { params: Promise<{ id: string }> }
function fail(error: string, status: number) { return NextResponse.json({ error }, { status }) }

/** A criação e evolução só podem escolher elementos das classes realmente aprendidas. */
function optionsForCharacter(character: Character, db: Pick<typeof store, "campaignState" | "characters">) {
  const customRaw = db.campaignState.get(character.campaignId)?.customClasses
  const customClasses = Array.isArray(customRaw) ? customRaw as GameClass[] : []
  const campaignCharacters = [...db.characters.values()].filter(c => c.campaignId === character.campaignId)
  const catalog = getCampaignClassCatalog(campaignCharacters, customClasses)
  const activeClassIds = new Set(character.classes.filter(c => c.level > 0).map(c => c.classId))
  return availableClassElements(catalog.filter(cls => activeClassIds.has(cls.id)).map(cls =>
    customClasses.find(original => original.id === cls.id) || CLASSES.find(official => official.id === cls.id) || cls))
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return fail("Não autenticado.", 401)
  const { id } = await context.params
  const character = store.characters.get(id)
  if (!character) return fail("Personagem não encontrado.", 404)
  const campaign = store.campaigns.get(character.campaignId)
  const role = campaign && getMemberRole(campaign, user.id)
  if (!role) return fail("Sem acesso à campanha.", 403)
  return NextResponse.json({
    affinities: readElementalSelection((character as Character & { elementalAffinities?: unknown }).elementalAffinities),
    // Não revelar elementos de classes restritas de outra ficha a espectadores.
    ...(role === "gm" || character.ownerId === user.id ? { available: optionsForCharacter(character, store) } : {}),
  })
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return fail("Não autenticado.", 401)
  const { id } = await context.params
  const original = store.characters.get(id)
  if (!original) return fail("Personagem não encontrado.", 404)
  const campaign = store.campaigns.get(original.campaignId)
  const role = campaign && getMemberRole(campaign, user.id)
  if (!role || (role !== "gm" && original.ownerId !== user.id)) return fail("Somente o dono da ficha ou o Mestre pode editar afinidades.", 403)
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body) || !["assign", "unlock"].includes(body.action))
    return fail("Operação de afinidade inválida.", 400)
  if (body.action === "assign" && (typeof body.primary !== "string" || (body.secondary !== null && body.secondary !== undefined && typeof body.secondary !== "string")))
    return fail("Seleção de elementos inválida.", 400)
  try {
    const value = await transactStore(draft => {
      const c = draft.characters.get(id)
      if (!c || c.campaignId !== original.campaignId) throw new Error("Personagem não encontrado.")
      const currentCampaign = draft.campaigns.get(c.campaignId)
      const currentRole = currentCampaign && getMemberRole(currentCampaign, user.id)
      if (!currentRole || (currentRole !== "gm" && c.ownerId !== user.id))
        throw new Error("Sem permissão para editar estas afinidades.")
      const saved = readElementalSelection((c as Character & { elementalAffinities?: unknown }).elementalAffinities)
      let affinity: ElementalAffinitySelection
      let resources = c.resources
      if (body.action === "unlock") {
        if (!saved.locked) throw new Error("As afinidades já estão disponíveis para edição.")
        const lore = Number(c.resources.lp) || 0
        if (!Number.isSafeInteger(lore) || lore < 1) throw new Error("Você precisa de 1 ponto de Lore para redefinir as afinidades.")
        affinity = { ...saved, locked: false }
        resources = { ...c.resources, lp: lore - 1 }
      } else {
        if (saved.locked) throw new Error("Afinidades fixadas. Gaste 1 ponto de Lore para desbloquear a edição.")
        const available = optionsForCharacter(c, draft)
        const primary = elementId(body.primary)
        const secondary = body.secondary == null ? null : elementId(body.secondary)
        if (!primary || !available.includes(primary)) throw new Error("A afinidade principal deve pertencer a uma classe do personagem.")
        if (available.length > 1 && (!secondary || !available.includes(secondary) || secondary === primary))
          throw new Error("Selecione uma afinidade secundária diferente da principal.")
        if (secondary && (!available.includes(secondary) || secondary === primary)) throw new Error("Afinidade secundária inválida.")
        affinity = { primary, secondary, locked: true }
      }
      const updated: Character = {
        ...c, resources,
        elementalAffinities: affinity,
        updatedAt: Math.max(Date.now(), Number(c.updatedAt || 0) + 1),
      } as Character
      draft.characters.set(id, updated)
      return { value: updated, changed: true }
    })
    publish(original.campaignId, { type: "character:updated", character: value } as RealtimeEvent)
    return NextResponse.json({ character: value })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha ao gravar afinidades.", 400)
  }
}
