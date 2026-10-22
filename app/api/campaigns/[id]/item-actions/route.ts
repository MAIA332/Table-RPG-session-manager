import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store, transactStore } from "@/lib/store"
import { campaignItemCatalog } from "@/lib/inventory-server"
import { EQUIPMENT } from "@/lib/game-data"
import { OVERWEIGHT_MODIFIER_ID } from "@/lib/character"
import type { Character, RealtimeEvent } from "@/lib/types"
import {
  ITEM_COOLDOWN_PREFIX, ITEM_INVERSION_PREFIX, ITEM_REQUEST_PREFIX,
  equippedItemBonuses, getItemActions, isConsumableItem, itemCooldownRemaining,
  itemInversionState, itemResolvedStats, rollItemDice, sumItemBonus,
  validateItemAction,
} from "@/lib/item-mechanics"

class ItemActionError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

type RollResult = { kind: "Acerto" | "Dano"; label: string; values: number[]; modifier: number; total: number }
type ItemActionResponse = { character: Character; duplicate: boolean; deactivated: boolean; rolls: RollResult[]; actionName: string; itemName: string }

/** Aplica custos, cooldown e inversões na mesma transação de MongoDB. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })
  const role = getMemberRole(campaign, user.id)
  if (!role) return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  const body = await request.json().catch(() => null)
  const { characterId, itemId, actionId, requestId, mode = "use" } = body || {}
  if (![characterId, itemId, actionId, requestId].every(value => typeof value === "string" && value.length > 0 && value.length <= 120) ||
      !["use", "deactivate"].includes(mode))
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 })

  try {
    const result = await transactStore<ItemActionResponse>((draft) => {
      const original = draft.characters.get(characterId)
      if (!original || original.campaignId !== campaignId) throw new ItemActionError("Personagem não encontrado.", 404)
      if (role !== "gm" && original.ownerId !== user.id) throw new ItemActionError("Sem permissão para usar itens.", 403)
      const catalog = [
        ...campaignItemCatalog(draft, campaignId),
        ...EQUIPMENT.filter(base => !campaignItemCatalog(draft, campaignId).some(item => item.id === base.id)),
      ]
      const item = catalog.find(entry => entry.id === itemId)
      if (!item || !original.equipment.includes(itemId)) throw new ItemActionError("Item não está na mochila.", 409)
      const itemName = String((item as { name?: unknown }).name || "Equipamento")
      const action = getItemActions(item).find(entry => entry.id === actionId)
      if (!action) throw new ItemActionError("Habilidade não encontrada.", 404)
      validateItemAction(action)
      const mods: any[] = structuredClone((original as Character & { customModifiers?: any[] }).customModifiers || [])
      const requestKey = `${ITEM_REQUEST_PREFIX}${requestId}`
      if (mods.some(mod => mod.id === requestKey)) return { changed: false, value: {
        character: original, duplicate: true, deactivated: mode === "deactivate", rolls: [], actionName: action.name, itemName,
      } }
      const now = Date.now()
      const effectId = `${ITEM_INVERSION_PREFIX}${itemId}:${actionId}`
      const existingEffect = itemInversionState(original, itemId, actionId, now)
      const isDeactivate = mode === "deactivate"
      if (isDeactivate && action.template !== "attribute-inverter")
        throw new ItemActionError("Esta habilidade não tem inversor para desativar.")
      if (!isDeactivate && existingEffect) throw new ItemActionError("Efeito já ativo; desative-o antes de usar novamente.", 409)
      if (!isDeactivate && itemCooldownRemaining(original, itemId, actionId, now) > 0)
        throw new ItemActionError("A habilidade ainda está em cooldown.", 409)

      let rolls: RollResult[] = []
      const resources = { ...original.resources }
      let equipment = [...original.equipment]
      if (isDeactivate) {
        if (!existingEffect) throw new ItemActionError("Não há efeito ativo para desativar.", 409)
        const position = mods.findIndex(mod => mod.id === effectId)
        if (position >= 0) mods[position] = { ...mods[position], active: false }
      } else {
        if (action.cost > 0) {
          if (action.costResource === "ip") throw new ItemActionError("PI é capacidade de carga. Configure o custo em PM ou PV.")
          if (resources[action.costResource] < action.cost) throw new ItemActionError("Recursos insuficientes.", 409)
          resources[action.costResource] -= action.cost
        }
        if (action.kind === "heal" && action.restoreAmount > 0) {
          if (action.restoreResource === "ip") throw new ItemActionError("PI não pode ser recuperado como recurso.")
          const key = action.restoreResource
          const maxKey = key === "hp" ? "maxHp" : "maxMp"
          resources[key] = Math.min(resources[maxKey], resources[key] + action.restoreAmount)
        }
        if (action.template === "attribute-inverter" && action.inversion) {
          const cfg = action.inversion
          const effective = itemResolvedStats(original, catalog, now)
          const current: Record<string, string | number> = { ...effective.attributes, defense: effective.defense, magicDefense: effective.magicDefense }
          const effect: any = {
            id: effectId, name: `${itemName}: ${action.name}`, type: "item_attribute_inversion",
            target: "item_inversion_hidden", value: 0, itemId, actionId,
            active: true, operation: cfg.operation, source: cfg.source, destination: cfg.target,
            sourceValue: current[cfg.source], destinationValue: current[cfg.target],
            ...(cfg.durationSeconds != null ? { expiresAt: now + cfg.durationSeconds * 1000 } : {}),
          }
          const position = mods.findIndex(mod => mod.id === effectId)
          if (position < 0) mods.push(effect)
          else mods[position] = effect
        }
        if (action.cooldownSeconds && action.cooldownSeconds > 0) {
          const markerId = `${ITEM_COOLDOWN_PREFIX}${itemId}:${actionId}`
          const marker = { id: markerId, name: `Recarga: ${action.name}`, target: "item_cooldown_hidden", value: 0,
            type: "item_action_cooldown", itemId, actionId, expiresAt: now + action.cooldownSeconds * 1000 }
          const position = mods.findIndex(mod => mod.id === markerId)
          if (position < 0) mods.push(marker)
          else mods[position] = marker
        }
        const attributes = itemResolvedStats(original, catalog, now).attributes
        const bonuses = equippedItemBonuses(original, catalog)
        const modifierFor = (expression: string, labels: string[]) =>
          sumItemBonus(bonuses, labels) + ( /\bdex\b/i.test(expression)
            ? Number(mods.find(mod => mod.id === OVERWEIGHT_MODIFIER_ID)?.value || 0) : 0 )
        const rolling = [
          ...(action.attackDice?.trim() ? [{ kind: "Acerto" as const, formula: action.attackDice, targets: ["Acerto", "Ataque"] }] : []),
          ...(action.damageDice?.trim() ? [{ kind: "Dano" as const, formula: action.damageDice, targets: ["Dano"] }] : []),
        ]
        rolls = rolling.map(entry => {
          const roll = rollItemDice(entry.formula, attributes, modifierFor(entry.formula, [...entry.targets, ...(entry.formula.match(/\b(dex|ins|mig|wlp)\b/gi) || [])]))
          return { kind: entry.kind, label: roll.label, values: roll.values, modifier: roll.modifier, total: roll.total }
        })
        if (action.consume || isConsumableItem(item)) {
          const index = equipment.indexOf(itemId)
          equipment.splice(index, 1)
          if (!equipment.includes(itemId)) {
            for (let i = mods.length - 1; i >= 0; i--) {
              if (mods[i].itemId === itemId && mods[i].type === "item_attribute_inversion") mods.splice(i, 1)
              else if (mods[i].id === `item_equipped:${itemId}`) mods.splice(i, 1)
            }
          }
        }
      }
      // Request marker impede cobrança/rolagem duplicada após retry/reconexão.
      mods.push({ id: requestKey, name: "Ação de item processada", type: "item_action_request", target: "item_request_hidden", value: 0,
        expiresAt: now + 86_400_000 })
      // Mantém somente os 120 marcadores recentes de idempotência.
      const requests = mods.filter(mod => mod.type === "item_action_request")
      if (requests.length > 120) {
        const toDrop = new Set(requests.slice(0, requests.length - 120).map(mod => mod.id))
        for (let i = mods.length - 1; i >= 0; i--) if (toDrop.has(mods[i].id)) mods.splice(i, 1)
      }
      const character = { ...original, equipment, resources,
        customModifiers: mods, updatedAt: Math.max(now, Number(original.updatedAt || 0) + 1) } as Character
      draft.characters.set(characterId, character)
      return { changed: true, value: { character, duplicate: false, deactivated: isDeactivate, rolls, itemName, actionName: action.name } }
    })
    if (!result.duplicate) {
      publish(campaignId, { type: "character:updated", character: result.character } as RealtimeEvent)
    }
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao usar item." },
      { status: error instanceof ItemActionError ? error.status : 400 })
  }
}
