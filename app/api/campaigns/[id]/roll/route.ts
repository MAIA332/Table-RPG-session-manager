import { NextResponse } from "next/server"
import { getMemberRole, publish, store } from "@/lib/store"
import { getCurrentUser } from "@/lib/auth"
import { EQUIPMENT } from "@/lib/game-data"
import { equippedItemBonuses, sumItemRollBonus } from "@/lib/item-mechanics"
import { campaignItemCatalog } from "@/lib/inventory-server"

/** O cliente informa os dados já rolados, sem o bônus do equipamento.
 * A API determina o bônus exclusivamente pelo inventário persistido.
 */
type RollContext = {
  characterId: string
  baseResult: number
  modifierWithoutItems: number
  targets: string[]
}

function readRollContext(value: unknown): RollContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.characterId !== "string" || !raw.characterId || raw.characterId.length > 120 ||
      typeof raw.baseResult !== "number" || !Number.isSafeInteger(raw.baseResult) || Math.abs(raw.baseResult) > 1000000 ||
      typeof raw.modifierWithoutItems !== "number" || !Number.isSafeInteger(raw.modifierWithoutItems) || Math.abs(raw.modifierWithoutItems) > 1000000 ||
      !Array.isArray(raw.targets) || raw.targets.length < 1 || raw.targets.length > 16 ||
      raw.targets.some(target => typeof target !== "string" || !target.trim() || target.length > 140)) return null
  return raw as RollContext
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 })

  const { id } = await params
  const campaign = store.campaigns.get(id)
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })
  const role = getMemberRole(campaign, user.id)
  if (!role) return NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 })

  const attribute = String(body.attribute || "")
  if (role !== "gm" && (attribute.startsWith("SYNC_IMAGE:") || attribute.startsWith("SYNC_GALLERY:")))
    return NextResponse.json({ error: "Apenas o mestre pode transmitir ou sincronizar a galeria." }, { status: 403 })

  let result = body.result
  let modifier = body.modifier
  let characterId = body.characterId
  let characterName = body.characterName
  // Mantém compatibilidade com outros eventos/rolagens que não usam o novo contrato.
  if (body.rollContext !== undefined) {
    const context = readRollContext(body.rollContext)
    if (!context || typeof body.result !== "number" || !Number.isFinite(body.result))
      return NextResponse.json({ error: "Contexto de rolagem inválido." }, { status: 400 })
    const character = store.characters.get(context.characterId)
    if (!character || character.campaignId !== id)
      return NextResponse.json({ error: "Personagem não encontrado nesta campanha." }, { status: 404 })
    if (role !== "gm" && character.ownerId !== user.id)
      return NextResponse.json({ error: "Sem permissão para rolar por este personagem." }, { status: 403 })

    const custom = campaignItemCatalog(store, id)
    const catalog = [
      ...custom,
      ...EQUIPMENT.filter(base => !custom.some(item => item.id === base.id)),
    ]
    const itemBonus = sumItemRollBonus(equippedItemBonuses(character, catalog), context.targets)
    result = context.baseResult + itemBonus
    modifier = context.modifierWithoutItems + itemBonus
    characterId = character.id
    characterName = character.name
  }

  publish(id, {
    type: "dice:roll",
    characterId,
    characterName,
    playerName: body.playerName,
    attribute: body.attribute,
    result,
    breakdown: body.breakdown,
    modifier,
  })
  return NextResponse.json({ success: true })
}
