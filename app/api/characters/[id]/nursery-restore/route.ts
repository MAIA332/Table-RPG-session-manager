import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store, transactStore } from "@/lib/store"
import { buildArchivedNpcPatch } from "@/lib/npc-archive-snapshot"
import { createNurseryRestorePatch } from "@/lib/npc-restoration"
import { validatePlayerSpecialAttacks } from "@/lib/player-special-attacks"
import { validateAlternatePortraits } from "@/lib/portrait-gallery"
import type { Character } from "@/lib/types"
import { normalizeResources } from "@/lib/character"
import { campaignItemCatalog } from "@/lib/inventory-server"
import { validateCustomCheck } from "@/lib/custom-checks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

class RestoreError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** Campos do Berçário autorizados. A identidade e a titularidade da ficha
 * recém-criada não podem vir do snapshot antigo. */
interface StoredNpc {
  id: string
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
  sourceCharacterId?: string
  linkedCharacterIds?: string[]
  npcModifiers?: Array<Record<string, unknown>>
  npcEquippedIds?: string[]
  elementalAffinities?: unknown
  specialAttacks?: unknown
  portraitLabel?: string
  portraitGallery?: unknown
  resources?: Character["resources"]
  npcLevel?: number
  npcChecks?: Character["npcChecks"]
  customModifiers?: Array<Record<string, unknown>>
  bestiaryAffinities?: Character["bestiaryAffinities"]
}

/** Consulta autenticada do Mestre para arquivar uma ficha atualizada.
 * Mantém o GET fora de /api/characters/[id], cuja rota não implementa GET.
 * A restauração POST retorna a ficha salva e não precisa consultar este GET.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const character = store.characters.get(id)
  if (!character) return NextResponse.json({ error: "Ficha não encontrada." }, { status: 404 })
  const campaign = store.campaigns.get(character.campaignId)
  if (!campaign || getMemberRole(campaign, user.id) !== "gm")
    return NextResponse.json({ error: "Somente o Mestre pode consultar a ficha para arquivamento." }, { status: 403 })
  return NextResponse.json({ character }, { headers: { "Cache-Control": "private, no-store" } })
}

/**
 * Aplica dados já salvos no Berçário, dentro de uma só transação do MongoDB.
 * Não recebe a ficha ou snapshot do navegador: estes dados vêm da campanha.
 * Golpes, retratos e afinidades são restaurados na MESMA transação. A rota
 * comum de afinidades exige Lore para trocar uma seleção já fixada; tal
 * regra é para jogadores, não para o Mestre restaurando seu próprio NPC.
 * A validação dos golpes/retratos é a mesma das APIs especializadas.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.npcId !== "string" || !body.npcId || body.npcId.length > 200)
    return NextResponse.json({ error: "Referência do NPC inválida." }, { status: 400 })

  try {
    const updated = await transactStore(db => {
      const current = db.characters.get(id)
      if (!current) throw new RestoreError("Ficha ativa não encontrada.", 404)
      const campaign = db.campaigns.get(current.campaignId)
      if (!campaign || getMemberRole(campaign, user.id) !== "gm")
        throw new RestoreError("Somente o Mestre pode restaurar NPCs.", 403)
      const state = db.campaignState.get(current.campaignId) || {}
      const entries = Array.isArray(state.customNPCs) ? state.customNPCs as StoredNpc[] : []
      const draft = entries.find(npc => npc && npc.id === body.npcId)
      if (!draft) throw new RestoreError("NPC não encontrado no Berçário desta campanha.", 404)
      if (draft.archivedSnapshot?.campaignId && draft.archivedSnapshot.campaignId !== current.campaignId)
        throw new RestoreError("O NPC arquivado pertence a outra campanha.", 403)
      if (!Array.isArray(draft.equipment) || !Array.isArray(draft.classes) ||
          !draft.attributes || typeof draft.attributes !== "object" ||
          !draft.skills || typeof draft.skills !== "object")
        throw new RestoreError("Dados do NPC no Berçário estão incompletos.")
      const linked = draft.linkedCharacterIds?.includes(id) || draft.sourceCharacterId === id
      // Uma primeira invocação ainda não possui vínculo: deve ser uma ficha
      // criada pelo próprio Mestre e com o nome do registro a restaurar.
      if (!linked && (current.ownerId !== user.id || current.name.trim() !== draft.name.trim()))
        throw new RestoreError("Esta ficha não pertence à invocação selecionada.", 403)

      const patch = createNurseryRestorePatch(draft, buildArchivedNpcPatch({
        ...draft,
        portraitLabel: undefined,
        portraitGallery: undefined,
        elementalAffinities: undefined,
        specialAttacks: undefined,
      }))
      const snapshot = draft.archivedSnapshot ? structuredClone(draft.archivedSnapshot) : {}
      // Campos explicitamente definidos no Berçário prevalecem sobre o snapshot
      // (inclusive [] para apagar golpes ou retratos antigos).
      const stored = snapshot as Character & {
        specialAttacks?: unknown
        portraitLabel?: string
        portraitGallery?: unknown
        elementalAffinities?: unknown
      }
      const attacksInput = draft.specialAttacks ?? stored.specialAttacks
      let attacks: ReturnType<typeof validatePlayerSpecialAttacks> | undefined
      try { if (attacksInput !== undefined) attacks = validatePlayerSpecialAttacks(attacksInput) }
      catch (reason) { throw new RestoreError(reason instanceof Error ? reason.message : "Golpes especiais inválidos.") }
      const galleryInput = draft.portraitGallery ?? stored.portraitGallery
      let portraitGallery: ReturnType<typeof validateAlternatePortraits> | undefined
      try { if (galleryInput !== undefined) portraitGallery = validateAlternatePortraits(galleryInput) }
      catch (reason) { throw new RestoreError(reason instanceof Error ? reason.message : "Retratos alternativos inválidos.") }
      const portraitLabelInput = draft.portraitLabel ?? stored.portraitLabel
      const portraitLabel = portraitLabelInput === undefined ? undefined : portraitLabelInput.trim()
      if (portraitLabel !== undefined && (!portraitLabel || portraitLabel.length > 60))
        throw new RestoreError("Legenda do retrato principal inválida.")
      const affinityInput = draft.elementalAffinities ?? stored.elementalAffinities
      if (affinityInput !== undefined && (!affinityInput || typeof affinityInput !== "object" || Array.isArray(affinityInput)))
        throw new RestoreError("Afinidades do NPC inválidas.")
      const preserved = {
        id: current.id,
        ownerId: current.ownerId,
        campaignId: current.campaignId,
        createdAt: current.createdAt,
      }
      const items = draft.npcEquippedIds === undefined ? undefined :
        [...new Set(draft.npcEquippedIds.filter(itemId => typeof itemId === "string" && draft.equipment.includes(itemId)))]
      const next = {
        ...current,
        ...snapshot,
        ...patch,
        avatarUrl: draft.avatarUrl || current.avatarUrl,
        // Os extras são persistidos juntos: nenhum segundo PATCH por Lore
        // pode bloquear a invocação ou sobrescrever o golpe recém-criado.
        ...(affinityInput !== undefined ? { elementalAffinities: structuredClone(affinityInput) } : {}),
        ...(attacks !== undefined ? {
          specialAttacks: attacks,
          specialAttackUseCounts: Object.fromEntries(
            Object.entries((stored as any).specialAttackUseCounts ?? (current as any).specialAttackUseCounts ?? {})
              .filter(([attackId, count]) => attacks.some(attack => attack.id === attackId)
                && typeof count === "number" && Number.isSafeInteger(count) && count >= 0),
          ),
        } : {}),
        ...(portraitGallery !== undefined ? { portraitGallery } : {}),
        ...(portraitLabel !== undefined ? { portraitLabel } : {}),
        // Guarda a seleção de itens preparados; o sistema de inventário pode
        // interpretar o campo junto aos estados originais do snapshot.
        ...(items !== undefined ? { npcEquippedIds: items } : {}),
        ...preserved,
        isNpc: true,
        updatedAt: Math.max(Date.now(), current.updatedAt + 1),
      } as Character
      if (next.npcChecks) next.npcChecks = next.npcChecks.map(validateCustomCheck).map(check => ({ ...check, isPublic: false }))
      if (Object.values(next.resources).some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0))
        throw new RestoreError("Recursos do NPC inválidos.")
      if (next.resources.maxHp < 1) throw new RestoreError("A vida máxima deve ser positiva.")
      if (!["dex", "ins", "mig", "wlp"].every(key => /^d(4|6|8|10|12|14|16|18|20)$/.test((next.attributes as any)[key])))
        throw new RestoreError("Atributos do NPC inválidos.")
      const normalized = normalizeResources(next, campaignItemCatalog(db, current.campaignId))
      db.characters.set(id, normalized)
      // A primeira invocação passa a ter o vínculo confirmado na mesma transação.
      if (!draft.linkedCharacterIds?.includes(id)) db.campaignState.set(current.campaignId, {
        ...state, customNPCs: entries.map(entry => entry.id === draft.id ? { ...entry, linkedCharacterIds: [...(entry.linkedCharacterIds || []), id] } : entry),
      })
      return { value: normalized, changed: true }
    })
    publish(updated.campaignId, { type: "character:updated", character: updated })
    return NextResponse.json({ character: updated }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível restaurar a ficha." },
      { status: error instanceof RestoreError ? error.status : 500 },
    )
  }
}
