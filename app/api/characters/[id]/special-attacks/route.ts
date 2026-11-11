import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store, transactStore } from "@/lib/store"
import type { Character } from "@/lib/types"
import { MAX_LORE_BONUS_LEVEL, LORE_UPGRADE_COST, type LoreUpgradeRecord } from "@/lib/special-attack-lore"
import { isTrainingActive } from "@/lib/training-model"
import {
  validatePlayerSpecialAttacks, validPlayerAttackId,
  type PlayerSpecialAttackCharacter, type PlayerAttackPreview, type PlayerSpecialAttack,
} from "@/lib/player-special-attacks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

class AttackError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}
function responseError(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao processar o golpe." },
    { status: error instanceof AttackError ? error.status : 400 })
}
function canEdit(character: Character, userId: string, role: unknown) {
  return Boolean(role && (role === "gm" || character.ownerId === userId))
}
function getAccess(id: string, userId: string) {
  const character = store.characters.get(id)
  if (!character) throw new AttackError("Personagem não encontrado.", 404)
  const campaign = store.campaigns.get(character.campaignId)
  const role = campaign && getMemberRole(campaign, userId)
  if (!canEdit(character, userId, role)) throw new AttackError("Sem permissão para essa ficha.", 403)
  return character
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new AttackError("Não autenticado.", 401)
    const { id } = await params
    const character = getAccess(id, user.id) as Character & PlayerSpecialAttackCharacter
    return NextResponse.json({ attacks: character.specialAttacks || [] },
      { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return responseError(error) }
}

/** Salvar e usar são operações protegidas; nunca aceitar rolagens ou dados arbitrários do cliente. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new AttackError("Não autenticado.", 401)
    const { id } = await params
    getAccess(id, user.id)
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AttackError("Corpo inválido.")
    const action = String(body.action || "")
    if (action === "save") {
      // Salva o conjunto completo, no mesmo armazenamento transacional da ficha.
      const validated = validatePlayerSpecialAttacks(body.attacks)
      const updated = await transactStore(db => {
        const current = db.characters.get(id) as (Character & PlayerSpecialAttackCharacter) | undefined
        if (!current) throw new AttackError("Personagem não encontrado.", 404)
        const campaign = db.campaigns.get(current.campaignId)
        const role = campaign && getMemberRole(campaign, user.id)
        if (!canEdit(current, user.id, role)) throw new AttackError("Sem permissão.", 403)
        // O nível adquirido jamais vem do JSON enviado pelo navegador.
        // Um save com estado antigo não pode apagar nem aumentar bônus pagos.
        const safeAttacks = validated.map(attack => ({
          ...attack,
          loreBonusLevel: current.specialAttacks?.find(old => old.id === attack.id)?.loreBonusLevel || 0,
        }))
        // Excluir contadores órfãos quando um golpe for removido pelo jogador.
        const savedCounts = current.specialAttackUseCounts || {}
        const validIds = new Set(safeAttacks.map(attack => attack.id))
        const useCounts: Record<string, number> = {}
        for (const [attackId, count] of Object.entries(savedCounts)) {
          if (validIds.has(attackId) && Number.isSafeInteger(count) && count >= 0)
            useCounts[attackId] = count
        }
        const next = { ...current, specialAttacks: safeAttacks, specialAttackUseCounts: useCounts,
          updatedAt: Math.max(Date.now(), current.updatedAt + 1) }
        db.characters.set(id, next)
        return { value: next, changed: true }
      }) as Character & PlayerSpecialAttackCharacter
      publish(updated.campaignId, { type: "character:updated", character: updated })
      return NextResponse.json({ attacks: updated.specialAttacks || [], character: updated })
    }
    if (action === "upgrade-lore") {
      const attackId = body.attackId
      if (!validPlayerAttackId(attackId)) throw new AttackError("Golpe inválido.")
      // A transação serializa a leitura de LP e a atualização do nível.
      const upgrade = await transactStore(db => {
        const current = db.characters.get(id) as (Character & PlayerSpecialAttackCharacter) | undefined
        if (!current) throw new AttackError("Personagem não encontrado.", 404)
        const campaign = db.campaigns.get(current.campaignId)
        const role = campaign && getMemberRole(campaign, user.id)
        if (!canEdit(current, user.id, role)) throw new AttackError("Sem permissão.", 403)
        if (current.isNpc) throw new AttackError("NPCs utilizam o editor gratuito de dados do Mestre.")
        const attacks = current.specialAttacks || []
        const index = attacks.findIndex(attack => attack.id === attackId)
        if (index < 0) throw new AttackError("Golpe não encontrado.", 404)
        const level = attacks[index].loreBonusLevel || 0
        if (level >= MAX_LORE_BONUS_LEVEL) throw new AttackError("Bônus máximo de 2d20 já alcançado.")
        const available = Number(current.resources?.lp ?? 0)
        if (!Number.isSafeInteger(available) || available < LORE_UPGRADE_COST)
          throw new AttackError("São necessários 2 pontos de Lore para aprimorar este golpe.", 409)
        const updatedCharacter = {
          ...current,
          resources: { ...current.resources, lp: available - LORE_UPGRADE_COST },
          specialAttacks: attacks.map((attack, i) => i === index
            ? { ...attack, loreBonusLevel: level + 1, updatedAt: Date.now() } : attack),
          updatedAt: Math.max(Date.now(), current.updatedAt + 1),
        }
        db.characters.set(id, updatedCharacter)
        const record: LoreUpgradeRecord = {
          id: randomUUID(), characterId: current.id, characterName: current.name,
          attackId, attackName: attacks[index].name, ownerId: current.ownerId,
          cost: LORE_UPGRADE_COST, newLevel: level + 1, at: Date.now(),
        }
        const state = db.campaignState.get(current.campaignId) || {}
        const previous = Array.isArray(state.loreUpgradeHistory) ? state.loreUpgradeHistory as LoreUpgradeRecord[] : []
        db.campaignState.set(current.campaignId, { ...state, loreUpgradeHistory: [record, ...previous].slice(0,50) })
        return { value: {character:updatedCharacter,record}, changed: true }
      }) as {character:Character & PlayerSpecialAttackCharacter;record:LoreUpgradeRecord}
      const updated = upgrade.character
      publish(updated.campaignId, { type: "character:updated", character: updated })
      publish(updated.campaignId, { type: "special-attack:lore-upgraded", record: upgrade.record })
      return NextResponse.json({ success: true, attacks: updated.specialAttacks, character: updated },
        { headers: { "Cache-Control": "no-store" } })
    }
    if (action !== "use") throw new AttackError("Ação desconhecida.")
    const attackId = body.attackId
    const requestId = body.requestId
    if (!validPlayerAttackId(attackId) || !validPlayerAttackId(requestId)) {
      throw new AttackError("Identificação do golpe ou da solicitação inválida.")
    }
    type UseOutcome = {
      attack: PlayerSpecialAttack
      preview: PlayerAttackPreview | null
      duplicate: boolean
      campaignId: string
      character?: Character & PlayerSpecialAttackCharacter
    }
    const outcome = await transactStore((db): { value: UseOutcome; changed: boolean } => {
      const current = db.characters.get(id) as (Character & PlayerSpecialAttackCharacter) | undefined
      if (!current) throw new AttackError("Personagem não encontrado.", 404)
      const campaign = db.campaigns.get(current.campaignId)
      const role = campaign && getMemberRole(campaign, user.id)
      if (!canEdit(current, user.id, role)) throw new AttackError("Sem permissão.", 403)
      if (isTrainingActive((current as any).training)) throw new AttackError("A ficha está em treinamento e não pode rolar dados.", 409)
      const attack = current.specialAttacks?.find(item => item.id === attackId)
      if (!attack) throw new AttackError("Golpe não encontrado. Atualize a ficha.", 404)
      const now = Date.now()
      // Rate limit por USUÁRIO na campanha, mesmo que possua vários personagens.
      // Persistido no estado da campanha para continuar após reload/reconexão.
      const state = db.campaignState.get(current.campaignId) || {}
      const rateByUser = state.playerAttackRateByUser && typeof state.playerAttackRateByUser === "object"
        && !Array.isArray(state.playerAttackRateByUser)
        ? state.playerAttackRateByUser as Record<string, Array<{ requestId: string; attackId: string; at: number }>>
        : {}
      const previous = (Array.isArray(rateByUser[user.id]) ? rateByUser[user.id] : [])
        .filter(entry => Number.isFinite(entry.at) && entry.at > now - 60_000 && entry.at <= now + 1_000)
      if (previous.some(entry => entry.requestId === requestId)) {
        return { changed: false, value: { attack, preview: null, duplicate: true, campaignId: current.campaignId } }
      }
      if (previous.length >= 3) throw new AttackError("Limite de 3 golpes em 60 segundos. Aguarde para utilizar outro.", 429)
      const history = [...previous, { requestId, attackId, at: now }]
      const liveRates: Record<string, typeof history> = {}
      for (const [key, entries] of Object.entries(rateByUser)) {
        if (!Array.isArray(entries)) continue
        const recent = entries.filter(entry => Number.isFinite(entry.at) && entry.at > now - 60_000)
        if (recent.length) liveRates[key] = recent
      }
      liveRates[user.id] = history
      const currentCount = current.specialAttackUseCounts?.[attackId]
      const count = typeof currentCount === "number" && Number.isSafeInteger(currentCount) && currentCount >= 0
        ? currentCount : 0
      const updatedCharacter: Character & PlayerSpecialAttackCharacter = {
        ...current,
        specialAttackUsage: history,
        specialAttackUseCounts: {
          ...current.specialAttackUseCounts,
          [attackId]: Math.min(Number.MAX_SAFE_INTEGER, count + 1),
        },
        updatedAt: Math.max(current.updatedAt + 1, now),
      }
      db.characters.set(id, updatedCharacter)
      let preview: PlayerAttackPreview | null = null
      if (attack.previewImageUrl) {
        preview = {
          id: randomUUID(), campaignId: current.campaignId,
          characterId: id, characterName: current.name,
          attackId, attackName: attack.name, targetDefense: attack.targetDefense,
          imageUrl: attack.previewImageUrl, startedAt: now,
          expiresAt: now + attack.previewDurationSeconds * 1_000,
        }
        const saved = Array.isArray(state.playerAttackPreviews)
          ? state.playerAttackPreviews as PlayerAttackPreview[] : []
        const live = saved.filter(item => item.expiresAt > now)
        // Evita exceder o limite de 16 MB por documento do MongoDB;
        // não remove imagens ainda válidas para liberar espaço.
        const payloadSize = live.reduce((sum, item) => sum + String(item.imageUrl || "").length, 0)
          + preview.imageUrl.length
        if (payloadSize > 6_000_000) throw new AttackError("Há muitas imagens temporárias ativas. Aguarde a expiração ou peça ao Mestre que encerre uma delas.", 429)
        db.campaignState.set(current.campaignId, { ...state, playerAttackRateByUser: liveRates, playerAttackPreviews: [...live, preview] })
      } else {
        db.campaignState.set(current.campaignId, { ...state, playerAttackRateByUser: liveRates })
      }
      return { changed: true, value: { attack, preview, duplicate: false, campaignId: current.campaignId, character: updatedCharacter } }
    }) as UseOutcome
    if (!outcome.duplicate && outcome.character) {
      publish(outcome.campaignId, { type: "character:updated", character: outcome.character })
    }
    if (!outcome.duplicate && outcome.preview) {
      publish(outcome.campaignId, { type: "player-attack-preview:updated" } as any)
    }
    // A mesma função da ficha executa a rolagem e publica o evento dice:roll.
    // Aqui registramos somente o uso, o limite e a disponibilidade temporária.
    return NextResponse.json({ success: true, ...outcome }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return responseError(error) }
}
