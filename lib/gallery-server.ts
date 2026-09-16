import type { Campaign, GalleryBroadcastRequest, GalleryFolder, GalleryImage, User } from "./types"
import { store } from "./store"

export const ROOT_GALLERY_FOLDER: GalleryFolder = { id: "root", name: "Todas as imagens" }

export function playerFolderId(userId: string) {
  return `player:${userId}`
}

export function getGalleryFolders(campaign: Campaign, savedFolders: GalleryFolder[]): GalleryFolder[] {
  const custom = (Array.isArray(savedFolders) ? savedFolders : []).filter(
    (folder) => folder && typeof folder.id === "string" && typeof folder.name === "string" && folder.id !== "root" && !folder.id.startsWith("player:"),
  )
  const players = campaign.members
    .filter((member) => member.role === "player")
    .map((member) => ({
      id: playerFolderId(member.userId),
      name: store.users.get(member.userId)?.name || "Jogador",
      ownerId: member.userId,
      isPlayerFolder: true,
    }))
  return [ROOT_GALLERY_FOLDER, ...custom, ...players]
}

export function sanitizeGalleryImage(value: unknown, fallbackOwner?: Pick<User, "id" | "name">): GalleryImage | null {
  if (!value || typeof value !== "object") return null
  const image = value as Record<string, unknown>
  const id = String(image.id || "").trim()
  const name = String(image.name || "").trim().slice(0, 120)
  let url = String(image.url || "").trim()
  if (/^http:\/\//i.test(url)) url = `https://${url.slice(7)}`
  if (!id || !name || !url || url.length > 5_000_000) return null
  if (!/^https:\/\//i.test(url) && !/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) return null
  const ownerId = String(image.ownerId || fallbackOwner?.id || "").trim()
  return {
    id, name, url,
    isPublic: Boolean(image.isPublic),
    folderId: String(image.folderId || "root"),
    ...(ownerId ? { ownerId, ownerName: store.users.get(ownerId)?.name || String(image.ownerName || fallbackOwner?.name || "Jogador") } : {}),
    createdAt: Number(image.createdAt) || Date.now(),
  }
}

export function sanitizeBroadcastRequest(value: unknown): GalleryBroadcastRequest | null {
  if (!value || typeof value !== "object") return null
  const request = value as GalleryBroadcastRequest
  if (!request.id || !request.imageId || !request.imageUrl || !request.requesterId) return null
  return request
}
