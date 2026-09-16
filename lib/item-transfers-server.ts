import { genId, getMemberRole, transactStore } from "./store"
import { applyInventoryRules } from "./character"
import { assertInventoryChange } from "./inventory-weight"
import { campaignItemCatalog } from "./inventory-server"
import { EQUIPMENT } from "./game-data"
import type { Character, ItemTransfer } from "./types"
type DB = Parameters<Parameters<typeof transactStore>[0]>[0]
const transferKey = (id: string) => `itemTransfers:${id}`
export const readTransfers = (db: DB, id: string): ItemTransfer[] => {
  const value = db.campaignState.get(transferKey(id))?.transfers
  return Array.isArray(value) ? (value as ItemTransfer[]) : []
}
function save(db: DB, id: string, transfers: ItemTransfer[]) {
  db.campaignState.set(transferKey(id), { transfers, updatedAt: Date.now() })
}
function withItem(
  character: Character,
  transfer: Pick<ItemTransfer, "itemKind" | "itemId" | "customItem">,
): Character {
  if (transfer.itemKind === "custom" && !transfer.customItem)
    throw new Error("Item personalizado da transferência inválido.")
  return {
    ...character,
    equipment:
      transfer.itemKind === "equipment"
        ? [...character.equipment, transfer.itemId]
        : character.equipment,
    customItems:
      transfer.itemKind === "custom"
        ? [...(character.customItems || []), transfer.customItem!]
        : character.customItems,
  }
}
export function createItemTransfer(db: DB, userId: string, body: any) {
  const donor = db.characters.get(body?.donorCharacterId),
    recipient = db.characters.get(body?.recipientCharacterId)
  if (
    !donor ||
    !recipient ||
    donor.id === recipient.id ||
    donor.campaignId !== recipient.campaignId
  )
    throw new Error("Personagens inválidos.")
  const campaign = db.campaigns.get(donor.campaignId)!,
    role = getMemberRole(campaign, userId)
  if (!role || (donor.ownerId !== userId && role !== "gm"))
    throw new Error("Sem permissão para doar este item.")
  if (!getMemberRole(campaign, recipient.ownerId))
    throw new Error("Receptor não participa da campanha.")
  const kind = body.itemKind === "custom" ? "custom" : "equipment",
    index = body.itemIndex
  const source = kind === "custom" ? donor.customItems || [] : donor.equipment
  if (!Number.isInteger(index) || index < 0 || index >= source.length)
    throw new Error("Item não está mais na mochila.")
  const transfers = readTransfers(db, donor.campaignId)
  if (
    transfers.some(
      (t) =>
        t.status === "pending" &&
        t.donorRetainsItem &&
        t.donorCharacterId === donor.id &&
        t.itemKind === kind &&
        t.sourceItemIndex === index,
    )
  )
    throw new Error("Este item já está aguardando uma transferência.")
  const customItem = kind === "custom" ? donor.customItems![index] : undefined
  const itemId = customItem?.id || donor.equipment[index]
  const catalog = campaignItemCatalog(db, donor.campaignId) as any[]
  const item =
    catalog.find((i) => i.id === itemId) ||
    EQUIPMENT.find((i) => i.id === itemId)
  const transfer: ItemTransfer = {
    id: genId("transfer"),
    campaignId: donor.campaignId,
    donorCharacterId: donor.id,
    donorCharacterName: donor.name,
    donorOwnerId: donor.ownerId,
    recipientCharacterId: recipient.id,
    recipientCharacterName: recipient.name,
    recipientOwnerId: recipient.ownerId,
    itemId,
    itemName: customItem?.name || item?.name || "Item",
    itemKind: kind,
    customItem,
    status: "pending",
    createdAt: Date.now(),
    donorRetainsItem: true,
    sourceItemIndex: index,
  }
  assertInventoryChange(recipient, withItem(recipient, transfer), catalog)
  save(db, donor.campaignId, [...transfers, transfer])
  return { transfer, donor: applyInventoryRules(donor, catalog) }
}
export function resolveItemTransfer(
  db: DB,
  userId: string,
  id: string,
  resolution: "accepted" | "rejected",
) {
  let transfer: ItemTransfer | undefined
  for (const campaign of db.campaigns.values()) {
    transfer = readTransfers(db, campaign.id).find((t) => t.id === id)
    if (transfer) break
  }
  if (!transfer || transfer.status !== "pending")
    throw new Error("Transferência não está mais pendente.")
  const donor = db.characters.get(transfer.donorCharacterId),
    recipient = db.characters.get(transfer.recipientCharacterId)
  if (!donor || !recipient) throw new Error("Personagem não encontrado.")
  if (
    recipient.ownerId !== userId ||
    !getMemberRole(db.campaigns.get(transfer.campaignId)!, userId)
  )
    throw new Error("Apenas o receptor pode responder.")
  const catalog = campaignItemCatalog(db, transfer.campaignId)
  let nextDonor = donor,
    nextRecipient = recipient
  if (resolution === "accepted") {
    if (transfer.donorRetainsItem) {
      const index = transfer.sourceItemIndex!
      const source =
        transfer.itemKind === "custom"
          ? donor.customItems || []
          : donor.equipment
      const sourceId =
        transfer.itemKind === "custom"
          ? (source[index] as any)?.id
          : source[index]
      if (sourceId !== transfer.itemId)
        throw new Error(
          "O item foi removido ou mudou de posição. Recuse esta solicitação e peça um novo envio.",
        )
      if (transfer.itemKind === "custom")
        transfer = { ...transfer, customItem: donor.customItems![index] }
      nextDonor = {
        ...donor,
        equipment:
          transfer.itemKind === "equipment"
            ? donor.equipment.filter((_, i) => i !== index)
            : donor.equipment,
        customItems:
          transfer.itemKind === "custom"
            ? donor.customItems!.filter((_, i) => i !== index)
            : donor.customItems,
      }
      if (!nextDonor.equipment.includes(transfer.itemId))
        (nextDonor as any).customModifiers = (
          (donor as any).customModifiers || []
        ).filter((m: any) => m.id !== `item_equipped:${transfer!.itemId}`)
    }
    nextRecipient = withItem(recipient, transfer)
    assertInventoryChange(recipient, nextRecipient, catalog)
  } else if (!transfer.donorRetainsItem) {
    // Compatibilidade com envios antigos, que retiravam o item imediatamente.
    nextDonor = withItem(donor, transfer)
    try {
      assertInventoryChange(donor, nextDonor, catalog)
    } catch {
      throw new Error(
        "A mochila do doador não tem espaço para a devolução. O item continua preservado nesta transferência pendente; libere espaço e recuse novamente.",
      )
    }
    if (transfer.donorItemBonusesActive)
      (nextDonor as any).customModifiers = [
        ...((donor as any).customModifiers || []).filter(
          (m: any) => m.id !== `item_equipped:${transfer!.itemId}`,
        ),
        {
          id: `item_equipped:${transfer.itemId}`,
          name: `Bônus ativos: ${transfer.itemName}`,
          target: "item_state_hidden",
          value: 1,
        },
      ]
  }
  if (nextDonor !== donor)
    nextDonor = applyInventoryRules(
      { ...nextDonor, updatedAt: Math.max(Date.now(), donor.updatedAt + 1) },
      catalog,
    )
  if (nextRecipient !== recipient)
    nextRecipient = applyInventoryRules(
      {
        ...nextRecipient,
        updatedAt: Math.max(Date.now(), recipient.updatedAt + 1),
      },
      catalog,
    )
  const resolved: ItemTransfer = {
    ...transfer,
    status: resolution,
    resolvedAt: Date.now(),
  }
  db.characters.set(donor.id, nextDonor)
  db.characters.set(recipient.id, nextRecipient)
  save(
    db,
    transfer.campaignId,
    readTransfers(db, transfer.campaignId).map((t) =>
      t.id === id ? resolved : t,
    ),
  )
  return { transfer: resolved, donor: nextDonor, recipient: nextRecipient }
}
