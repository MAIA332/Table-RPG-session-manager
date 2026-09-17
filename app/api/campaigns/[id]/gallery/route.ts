import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getGalleryFolders, playerFolderId, sanitizeBroadcastRequest, sanitizeGalleryImage } from "@/lib/gallery-server"
import { getCampaignState, updateCampaignState } from "@/lib/campaign-state"
import { createGalleryDelivery, readGalleryDelivery } from "@/lib/gallery-delivery"
import { genId, getMemberRole, publish, store } from "@/lib/store"
import type { GalleryBroadcastRequest, GalleryFolder, GalleryImage, RealtimeEvent } from "@/lib/types"

export const dynamic = "force-dynamic"

async function getAccess(params: Promise<{ id: string }>) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }
  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }
  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }
  return { campaignId, campaign, role, user }
}

function galleryResponse(access: any) {
  const state = getCampaignState(access.campaignId)
  const images = (state.gallery as GalleryImage[]).filter(
    image => access.role === "gm" || image?.isPublic || image?.ownerId === access.user.id,
  )
  const requests = state.galleryBroadcastRequests
    .map(sanitizeBroadcastRequest)
    .filter((entry): entry is GalleryBroadcastRequest => Boolean(entry))
    .filter(entry => access.role === "gm" || entry.requesterId === access.user.id)
  return { images, folders: getGalleryFolders(access.campaign, state.galleryFolders), requests, capabilities: { targetedImages: true } }
}

function showImage(campaignId: string, image: { url: string; name: string }, targetUserId: string | null) {
  if (targetUserId === null) {
    publish(campaignId, { type: "gallery:image-show", url: image.url, name: image.name })
    return
  }
  const deliveryId = createGalleryDelivery(campaignId, targetUserId, image)
  // Nenhuma URL, nome de imagem ou identificação do destinatário no evento coletivo.
  publish(campaignId, { type: "gallery:image-available", deliveryId } as unknown as RealtimeEvent)
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if ("error" in access) return access.error
  const query = new URL(request.url).searchParams
  if (query.has("deliveryId")) {
    return NextResponse.json({
      broadcast: readGalleryDelivery(access.campaignId, access.user.id, query.get("deliveryId") || ""),
    }, { headers: { "Cache-Control": "private, no-store" } })
  }
  return NextResponse.json(galleryResponse(access), { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if ("error" in access) return access.error
  const { campaignId, campaign, role, user } = access
  const body = await request.json().catch(() => null)
  const action = String(body?.action || "")
  const state = getCampaignState(campaignId)
  let images = (state.gallery as GalleryImage[]).map(image => sanitizeGalleryImage(image)).filter((image): image is GalleryImage => Boolean(image))
  let folders = getGalleryFolders(campaign, state.galleryFolders)
  let requests = state.galleryBroadcastRequests.map(sanitizeBroadcastRequest).filter((entry): entry is GalleryBroadcastRequest => Boolean(entry))
  const targetUserId = body?.targetUserId ?? null
  if (action === "broadcast" || (action === "resolve-broadcast" && body?.resolution === "approved")) {
    if (role !== "gm") return NextResponse.json({ error: "Apenas o mestre pode transmitir." }, { status: 403 })
    if (targetUserId !== null && (typeof targetUserId !== "string" || !targetUserId.trim() || getMemberRole(campaign, targetUserId) !== "player")) {
      return NextResponse.json({ error: "Selecione um jogador válido desta campanha." }, { status: 400 })
    }
  }

  if (action === "replace") {
    if (role !== "gm") return NextResponse.json({ error: "Apenas o mestre pode organizar a galeria." }, { status: 403 })
    if (!Array.isArray(body.images) || !Array.isArray(body.folders)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
    folders = getGalleryFolders(campaign, body.folders as GalleryFolder[])
    const folderIds = new Set(folders.map(folder => folder.id))
    images = body.images.map((image: unknown) => sanitizeGalleryImage(image)).filter((image: GalleryImage | null): image is GalleryImage => Boolean(image)).map((image: GalleryImage) => ({
      ...image, folderId: folderIds.has(image.folderId || "root") ? image.folderId : "root",
    }))
  } else if (action === "add") {
    const image = sanitizeGalleryImage(body.image, user)
    if (!image) return NextResponse.json({ error: "Imagem inválida. Use HTTPS ou envie um arquivo de imagem." }, { status: 400 })
    if (images.some(entry => entry.id === image.id)) return NextResponse.json({ error: "Imagem duplicada." }, { status: 409 })
    image.ownerId = user.id
    image.ownerName = user.name
    image.folderId = role === "gm" ? image.folderId || "root" : playerFolderId(user.id)
    if (!folders.some(folder => folder.id === image.folderId)) image.folderId = "root"
    images.push(image)
  } else if (action === "toggle-public") {
    const image = images.find(entry => entry.id === body.imageId)
    if (!image) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 })
    if (role !== "gm" && image.ownerId !== user.id) return NextResponse.json({ error: "Você só pode editar suas imagens." }, { status: 403 })
    image.isPublic = !image.isPublic
  } else if (action === "delete") {
    const image = images.find(entry => entry.id === body.imageId)
    if (!image) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 })
    if (role !== "gm" && image.ownerId !== user.id) return NextResponse.json({ error: "Você só pode excluir suas imagens." }, { status: 403 })
    images = images.filter(entry => entry.id !== image.id)
    requests = requests.filter(entry => entry.imageId !== image.id)
  } else if (action === "request-broadcast") {
    if (role === "gm") return NextResponse.json({ error: "O mestre pode transmitir diretamente." }, { status: 400 })
    const image = images.find(entry => entry.id === body.imageId && entry.ownerId === user.id)
    if (!image) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 })
    if (requests.some(entry => entry.imageId === image.id && entry.requesterId === user.id)) return NextResponse.json({ error: "Esta imagem já aguarda aprovação." }, { status: 409 })
    const galleryRequest: GalleryBroadcastRequest = {
      id: genId("gallery_request"), imageId: image.id, imageName: image.name, imageUrl: image.url,
      requesterId: user.id, requesterName: user.name, createdAt: Date.now(),
    }
    requests.push(galleryRequest)
    updateCampaignState(campaignId, { galleryBroadcastRequests: requests })
    publish(campaignId, { type: "gallery:broadcast-requested", requestId: galleryRequest.id })
    return NextResponse.json(galleryResponse(access))
  } else if (action === "resolve-broadcast") {
    if (role !== "gm") return NextResponse.json({ error: "Apenas o mestre pode responder solicitações." }, { status: 403 })
    const resolution = body.resolution === "approved" ? "approved" : body.resolution === "rejected" ? "rejected" : null
    if (!resolution) return NextResponse.json({ error: "Resposta inválida." }, { status: 400 })
    const galleryRequest = requests.find(entry => entry.id === body.requestId)
    if (!galleryRequest) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 })
    requests = requests.filter(entry => entry.id !== galleryRequest.id)
    updateCampaignState(campaignId, { galleryBroadcastRequests: requests })
    publish(campaignId, { type: "gallery:broadcast-resolved", requestId: galleryRequest.id, requesterId: galleryRequest.requesterId, resolution })
    if (resolution === "approved") showImage(campaignId, { url: galleryRequest.imageUrl, name: galleryRequest.imageName }, targetUserId)
    return NextResponse.json(galleryResponse(access))
  } else if (action === "broadcast") {
    if (role !== "gm") return NextResponse.json({ error: "Apenas o mestre pode transmitir." }, { status: 403 })
    const image = images.find(entry => entry.id === body.imageId)
    if (!image) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 })
    showImage(campaignId, image, targetUserId)
    return NextResponse.json(galleryResponse(access))
  } else {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 })
  }
  updateCampaignState(campaignId, { gallery: images, galleryFolders: folders.filter(folder => !folder.isPlayerFolder), galleryBroadcastRequests: requests })
  publish(campaignId, { type: "gallery:changed" })
  return NextResponse.json(galleryResponse(access))
}
