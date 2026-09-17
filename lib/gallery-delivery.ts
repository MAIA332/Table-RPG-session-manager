import { randomUUID } from "node:crypto"

export interface GalleryDelivery {
  id: string
  campaignId: string
  targetUserId: string
  url: string
  name: string
  expiresAt: number
}

// Mesma vida útil em memória do sistema de eventos existente; não altera a galeria.
const shared = globalThis as unknown as {
  __vttGalleryDeliveries?: Map<string, GalleryDelivery>
}
const deliveries = shared.__vttGalleryDeliveries ?? new Map<string, GalleryDelivery>()
shared.__vttGalleryDeliveries = deliveries
const TTL = 60_000

function pruneDeliveries() {
  const now = Date.now()
  for (const [id, delivery] of deliveries) {
    if (delivery.expiresAt <= now) deliveries.delete(id)
  }
}

export function createGalleryDelivery(
  campaignId: string,
  targetUserId: string,
  image: { url: string; name: string },
): string {
  pruneDeliveries()
  const id = randomUUID()
  deliveries.set(id, { id, campaignId, targetUserId, url: image.url, name: image.name, expiresAt: Date.now() + TTL })
  return id
}

// O acesso à campanha deve ser validado pela rota antes desta consulta.
export function readGalleryDelivery(campaignId: string, userId: string, id: string) {
  pruneDeliveries()
  const delivery = deliveries.get(id)
  if (!delivery || delivery.campaignId !== campaignId || delivery.targetUserId !== userId) return null
  return { id: delivery.id, url: delivery.url, name: delivery.name }
}
