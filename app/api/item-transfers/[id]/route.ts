import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { applyInventoryRules } from "@/lib/character"
import { publish, saveToDisk, store } from "@/lib/store"
import type { Character, ItemTransfer } from "@/lib/types"

const transferKey = (campaignId: string) => `itemTransfers:${campaignId}`

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => null)
  const resolution = body?.resolution
  if (resolution !== "accepted" && resolution !== "rejected") return NextResponse.json({ error: "Resposta inválida." }, { status: 400 })

  let transfer: ItemTransfer | undefined
  let transfers: ItemTransfer[] = []
  let key = ""
  for (const campaign of store.campaigns.values()) {
    key = transferKey(campaign.id)
    const state = store.campaignState.get(key)
    transfers = Array.isArray(state?.transfers) ? state.transfers as ItemTransfer[] : []
    transfer = transfers.find(entry => entry.id === id)
    if (transfer) break
  }
  if (!transfer || transfer.status !== "pending") return NextResponse.json({ error: "Transferência não está mais pendente." }, { status: 404 })
  const recipient = store.characters.get(transfer.recipientCharacterId)
  const donor = store.characters.get(transfer.donorCharacterId)
  if (!recipient || !donor) return NextResponse.json({ error: "Personagem não encontrado." }, { status: 404 })
  if (recipient.ownerId !== user.id) return NextResponse.json({ error: "Apenas o receptor pode responder." }, { status: 403 })

  const now = Date.now()
  const recipientCustomItems = Array.isArray((recipient as any).customItems) ? (recipient as any).customItems : []
  const donorCustomItems = Array.isArray((donor as any).customItems) ? (donor as any).customItems : []
  const nextRecipient = resolution === "accepted" ? applyInventoryRules({
    ...recipient,
    equipment: transfer.itemKind === "equipment" ? [...recipient.equipment, transfer.itemId] : recipient.equipment,
    customItems: transfer.itemKind === "custom" && transfer.customItem ? [...recipientCustomItems, transfer.customItem] : recipientCustomItems,
    updatedAt: Math.max(now, recipient.updatedAt + 1)
  } as Character) : recipient
  const restoredModifiers = transfer.donorItemBonusesActive
    ? [...((donor as any).customModifiers || []), { id: `item_equipped:${transfer.itemId}`, name: `Bônus ativos: ${transfer.itemName}`, target: "item_state_hidden", value: 1 }]
    : (donor as any).customModifiers
  const nextDonor = resolution === "rejected" ? applyInventoryRules({
    ...donor,
    equipment: transfer.itemKind === "equipment" ? [...donor.equipment, transfer.itemId] : donor.equipment,
    customItems: transfer.itemKind === "custom" && transfer.customItem ? [...donorCustomItems, transfer.customItem] : donorCustomItems,
    customModifiers: restoredModifiers,
    updatedAt: Math.max(now, donor.updatedAt + 1)
  } as Character) : donor
  const resolved = { ...transfer, status: resolution, resolvedAt: now } as ItemTransfer
  store.characters.set(nextRecipient.id, nextRecipient)
  store.characters.set(nextDonor.id, nextDonor)
  store.campaignState.set(key, { transfers: transfers.map(entry => entry.id === id ? resolved : entry), updatedAt: now })
  saveToDisk(store)
  if (resolution === "accepted") publish(transfer.campaignId, { type: "character:updated", character: nextRecipient })
  else publish(transfer.campaignId, { type: "character:updated", character: nextDonor })
  publish(transfer.campaignId, { type: "item-transfer:resolved", transfer: resolved, donor: nextDonor, recipient: resolution === "accepted" ? nextRecipient : undefined })
  return NextResponse.json({ transfer: resolved, donor: nextDonor, recipient: nextRecipient })
}
