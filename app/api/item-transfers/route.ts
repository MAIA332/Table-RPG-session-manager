import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { applyInventoryRules } from "@/lib/character"
import { genId, getMemberRole, publish, saveToDisk, store } from "@/lib/store"
import { getEquipment } from "@/lib/game-data"
import type { Character, ItemTransfer } from "@/lib/types"

const transferKey = (campaignId: string) => `itemTransfers:${campaignId}`

function readTransfers(campaignId: string): ItemTransfer[] {
  const state = store.campaignState.get(transferKey(campaignId))
  return Array.isArray(state?.transfers) ? state.transfers as ItemTransfer[] : []
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const campaignId = new URL(request.url).searchParams.get("campaignId") || ""
  const campaign = store.campaigns.get(campaignId)
  if (!campaign || !getMemberRole(campaign, user.id)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  const characterIds = new Set([...store.characters.values()].filter(c => c.campaignId === campaignId && c.ownerId === user.id).map(c => c.id))
  return NextResponse.json({ transfers: readTransfers(campaignId).filter(t => t.status === "pending" && characterIds.has(t.recipientCharacterId)) })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const body = await request.json().catch(() => null)
  const donor = store.characters.get(String(body?.donorCharacterId || ""))
  const recipient = store.characters.get(String(body?.recipientCharacterId || ""))
  const itemIndex = Number(body?.itemIndex)
  const itemKind = body?.itemKind === "custom" ? "custom" : "equipment"
  if (!donor || !recipient || donor.campaignId !== recipient.campaignId) return NextResponse.json({ error: "Personagens inválidos." }, { status: 400 })
  const campaign = store.campaigns.get(donor.campaignId)
  const role = campaign ? getMemberRole(campaign, user.id) : undefined
  if (donor.ownerId !== user.id && role !== "gm") return NextResponse.json({ error: "Sem permissão para doar este item." }, { status: 403 })
  const donorCustomItems = Array.isArray((donor as any).customItems) ? (donor as any).customItems : []
  const sourceItems = itemKind === "custom" ? donorCustomItems : donor.equipment
  if (donor.id === recipient.id || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= sourceItems.length) return NextResponse.json({ error: "Transferência inválida." }, { status: 400 })

  const customItem = itemKind === "custom" ? donorCustomItems[itemIndex] : undefined
  if (itemKind === "custom" && (!customItem || typeof customItem.id !== "string")) return NextResponse.json({ error: "Item personalizado inválido." }, { status: 400 })
  const itemId = itemKind === "custom" ? customItem.id : donor.equipment[itemIndex]
  const item = getEquipment(itemId)
  const nextEquipment = itemKind === "equipment" ? donor.equipment.filter((_, index) => index !== itemIndex) : donor.equipment
  const nextCustomItems = itemKind === "custom" ? donorCustomItems.filter((_: unknown, index: number) => index !== itemIndex) : donorCustomItems
  const itemBonusId = `item_equipped:${itemId}`
  const donorItemBonusesActive = itemKind === "equipment" && !nextEquipment.includes(itemId) && Array.isArray((donor as any).customModifiers) && (donor as any).customModifiers.some((modifier: any) => modifier.id === itemBonusId)
  const nextDonor = applyInventoryRules({
    ...donor,
    equipment: nextEquipment,
    customItems: nextCustomItems,
    customModifiers: donorItemBonusesActive ? (donor as any).customModifiers.filter((modifier: any) => modifier.id !== itemBonusId) : (donor as any).customModifiers,
    updatedAt: Math.max(Date.now(), donor.updatedAt + 1),
  } as Character)
  const transfer: ItemTransfer = {
    id: genId("transfer"), campaignId: donor.campaignId,
    donorCharacterId: donor.id, donorCharacterName: donor.name, donorOwnerId: donor.ownerId,
    recipientCharacterId: recipient.id, recipientCharacterName: recipient.name, recipientOwnerId: recipient.ownerId,
    itemId, itemName: String(body?.itemName || customItem?.name || item?.name || "Item"), itemKind, customItem, donorItemBonusesActive, status: "pending", createdAt: Date.now(),
  }
  const key = transferKey(donor.campaignId)
  store.characters.set(donor.id, nextDonor)
  store.campaignState.set(key, { transfers: [...readTransfers(donor.campaignId), transfer], updatedAt: Date.now() })
  saveToDisk(store)
  publish(donor.campaignId, { type: "character:updated", character: nextDonor })
  publish(donor.campaignId, { type: "item-transfer:created", transfer })
  return NextResponse.json({ transfer, donor: nextDonor })
}
