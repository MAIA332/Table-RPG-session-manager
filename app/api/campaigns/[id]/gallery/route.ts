import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getGalleryFolders, playerFolderId, sanitizeBroadcastRequest, sanitizeGalleryImage } from "@/lib/gallery-server"
import { getCampaignState, updateCampaignState } from "@/lib/campaign-state"
import { createGalleryDelivery, readGalleryDelivery } from "@/lib/gallery-delivery"
import { genId, getMemberRole, publish, store } from "@/lib/store"
import {
  PRIVATE_FOLDERS_FLAG_ID, privateFoldersEnabled, isPrivatePlayerFolder,
  isProtectedImage, canManageGalleryImage, canReadGalleryImage,
  preserveProtectedGalleryItems, visibleGalleryImages,
  type GalleryPrivacyFolder,
} from "@/lib/gallery-privacy"
import type { GalleryBroadcastRequest, GalleryFolder, GalleryImage, RealtimeEvent } from "@/lib/types"

export const dynamic = "force-dynamic"

type Access = {
  campaignId: string
  campaign: NonNullable<ReturnType<typeof store.campaigns.get>>
  role: NonNullable<ReturnType<typeof getMemberRole>>
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
}

async function getAccess(params: Promise<{ id: string }>): Promise<Access | { error: NextResponse }> {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }
  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }
  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }
  return { campaignId, campaign, role, user }
}

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function galleryResponse(access: Access) {
  const state = getCampaignState(access.campaignId)
  const folders = getGalleryFolders(access.campaign, state.galleryFolders)
  const enabled = privateFoldersEnabled(state.galleryFolders)
  const allImages = (state.gallery as GalleryImage[]).map(image => sanitizeGalleryImage(image))
    .filter((image): image is GalleryImage => Boolean(image))
  const images = visibleGalleryImages(allImages, folders, enabled, access.user.id, access.role === "gm")
  const requests = state.galleryBroadcastRequests
    .map(sanitizeBroadcastRequest)
    .filter((entry): entry is GalleryBroadcastRequest => Boolean(entry))
    .filter(entry => {
      if (access.role !== "gm") return entry.requesterId === access.user.id
      const image = allImages.find(image => image.id === entry.imageId)
      return Boolean(image && canReadGalleryImage(image!, folders, enabled, access.user.id, true))
    })
  return {
    images, folders, requests,
    capabilities: { targetedImages: true, privateFoldersEnabled: enabled },
  }
}

function showImage(campaignId: string, image: { url: string; name: string }, targetUserId: string | null) {
  if (targetUserId === null) {
    publish(campaignId, { type: "gallery:image-show", url: image.url, name: image.name })
    return
  }
  const deliveryId = createGalleryDelivery(campaignId, targetUserId, image)
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
  if (!body || typeof body !== "object" || Array.isArray(body)) return error("Dados inválidos.")
  const action = String(body.action || "")
  const state = getCampaignState(campaignId)
  let records = Array.isArray(state.galleryFolders) ? [...state.galleryFolders] : []
  let enabled = privateFoldersEnabled(records)
  let images = (state.gallery as GalleryImage[]).map(image => sanitizeGalleryImage(image))
    .filter((image): image is GalleryImage => Boolean(image))
  let folders = getGalleryFolders(campaign, records)
  let requests = state.galleryBroadcastRequests.map(sanitizeBroadcastRequest)
    .filter((entry): entry is GalleryBroadcastRequest => Boolean(entry))
  const isGm = role === "gm"
  const findFolder = (id: string) => folders.find(folder => folder.id === id) as (GalleryFolder & GalleryPrivacyFolder) | undefined
  const isOwner = (folder: GalleryFolder & GalleryPrivacyFolder) => folder.ownerId === user.id
  const canEditFolder = (folder: GalleryFolder & GalleryPrivacyFolder) =>
    (isOwner(folder) && !folder.isPlayerFolder) ||
    (isGm && (!enabled || !isPrivatePlayerFolder(folder)) && !folder.isPlayerFolder)
  const mayManageImage = (image: GalleryImage) => canManageGalleryImage(image, folders, enabled, user.id, isGm)
  const targetUserId = body.targetUserId ?? null

  if (action === "set-private-folders") {
    if (!isGm) return error("Apenas o Mestre altera a proteção das pastas.", 403)
    if (typeof body.enabled !== "boolean") return error("Informe o estado do recurso.")
    if (enabled && body.enabled === false && body.confirmed !== true)
      return error("Confirme a desativação: todas as pastas privadas ficarão acessíveis ao Mestre.", 409)
    records = records.filter(folder => folder.id !== PRIVATE_FOLDERS_FLAG_ID)
    if (body.enabled) records.push({ id: PRIVATE_FOLDERS_FLAG_ID, name: "Configuração interna do acervo" } as GalleryFolder)
    await updateCampaignState(campaignId, { galleryFolders: records })
    publish(campaignId, { type: "gallery:changed" })
    return NextResponse.json(galleryResponse(access), { headers: { "Cache-Control": "private, no-store" } })
  }

  if (action === "create-folder") {
    if (!enabled || isGm) return error("Pastas privadas de jogadores precisam estar habilitadas pelo Mestre.", 403)
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name || name.length > 90) return error("Escolha um nome de pasta com até 90 caracteres.")
    if (folders.filter(folder => folder.ownerId === user.id && !folder.isPlayerFolder).length >= 40)
      return error("Limite de 40 pastas privadas por jogador.", 409)
    if (folders.some(folder => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
      return error("Já existe uma pasta com esse nome.", 409)
    const folder: GalleryFolder = { id: genId("gallery_folder"), name, ownerId: user.id } as GalleryFolder
    records.push(folder)
    await updateCampaignState(campaignId, { galleryFolders: records })
    publish(campaignId, { type: "gallery:changed" })
    return NextResponse.json(galleryResponse(access))
  }

  if (action === "rename-folder" || action === "delete-folder") {
    const folder = findFolder(String(body.folderId || ""))
    if (!folder) return error("Pasta não encontrada.", 404)
    if (folder.id === "root" || folder.isPlayerFolder || !canEditFolder(folder))
      return error("Sem permissão para modificar esta pasta.", 403)
    if (action === "rename-folder") {
      const name = typeof body.name === "string" ? body.name.trim() : ""
      if (!name || name.length > 90) return error("Informe um nome de até 90 caracteres.")
      if (folders.some(entry => entry.id !== folder.id && entry.name.toLowerCase() === name.toLowerCase()))
        return error("Já existe uma pasta com esse nome.", 409)
      records = records.map(entry => entry.id === folder.id ? { ...entry, name } : entry)
    } else {
      // Nunca despejar imagens privadas na raiz compartilhada ao excluir uma pasta.
      const destination = folder.ownerId && isPrivatePlayerFolder(folder) ? playerFolderId(folder.ownerId) : "root"
      images = images.map(image => image.folderId === folder.id ? { ...image, folderId: destination } : image)
      records = records.filter(entry => entry.id !== folder.id)
    }
    await updateCampaignState(campaignId, { gallery: images, galleryFolders: records })
    publish(campaignId, { type: "gallery:changed" })
    return NextResponse.json(galleryResponse(access))
  }

  if (action === "replace") {
    if (!isGm) return error("Apenas o Mestre pode organizar a galeria geral.", 403)
    if (!Array.isArray(body.images) || !Array.isArray(body.folders)) return error("Dados inválidos.")
    const candidateFolders = getGalleryFolders(campaign, body.folders as GalleryFolder[])
      .filter(folder => folder.id !== "root" && !folder.isPlayerFolder && (!enabled || !folder.ownerId))
    const protectedFolderIds = new Set(folders.filter(isPrivatePlayerFolder).map(folder => folder.id))
    const protectedImageIds = new Set(images.filter(image => protectedFolderIds.has(image.folderId || "root")).map(image => image.id))
    const knownIds = new Set([...candidateFolders.map(folder => folder.id), ...folders.map(folder => folder.id)])
    const candidateImages = body.images.map((item: unknown) => sanitizeGalleryImage(item))
      .filter((image: GalleryImage | null): image is GalleryImage => Boolean(image))
      .filter((image:any) => !enabled || !protectedImageIds.has(image.id))
      .map((image:any) => ({ ...image, folderId: knownIds.has(image.folderId || "root") ? image.folderId : "root" }))
    const retained = preserveProtectedGalleryItems(images, folders, candidateImages, candidateFolders, enabled)
    images = retained.images
    // Gravar os registros de pastas existentes e protegidas SEM o root virtual,
    // preservando a configuração interna e os IDs dos donos.
    const persistedFolders = retained.folders.filter(folder => folder.id !== "root" && !folder.isPlayerFolder)
    records = [...persistedFolders, ...records.filter(folder => folder.id === PRIVATE_FOLDERS_FLAG_ID)]
  } else if (action === "add") {
    const image = sanitizeGalleryImage(body.image, user)
    if (!image) return error("Imagem inválida. Use HTTPS ou envie um arquivo de imagem.")
    if (images.some(entry => entry.id === image.id)) return error("Imagem duplicada.", 409)
    image.ownerId = user.id
    image.ownerName = user.name
    if (!isGm) {
      const requested = String(body.image?.folderId || "")
      const folder = findFolder(requested)
      if (enabled && folder && folder.ownerId === user.id) image.folderId = requested
      else image.folderId = playerFolderId(user.id)
    } else {
      const folder = findFolder(image.folderId || "root")
      if (!folder || isProtectedImage(image, folders, enabled)) return error("O Mestre não pode inserir imagens em pasta protegida.", 403)
    }
    image.isPublic = false
    images.push(image)
  } else if (action === "toggle-public") {
    const image = images.find(entry => entry.id === body.imageId)
    if (!image) return error("Imagem não encontrada.", 404)
    if (!mayManageImage(image)) return error("Somente o dono da pasta pode liberar esta imagem.", 403)
    image.isPublic = !image.isPublic
  } else if (action === "move") {
    const image = images.find(entry => entry.id === body.imageId)
    const destination = findFolder(String(body.folderId || ""))
    if (!image || !destination) return error("Imagem ou pasta não encontrada.", 404)
    if (!mayManageImage(image)) return error("Sem permissão para mover esta imagem.", 403)
    if (isPrivatePlayerFolder(destination) && (enabled || !isGm) && destination.ownerId !== user.id)
      return error("Somente o dono pode colocar imagens nesta pasta.", 403)
    if (!isGm && destination.ownerId !== user.id)
      return error("Você só pode mover imagens para pastas próprias.", 403)
    image.folderId = destination.id
  } else if (action === "delete") {
    const image = images.find(entry => entry.id === body.imageId)
    if (!image) return error("Imagem não encontrada.", 404)
    if (!mayManageImage(image)) return error("Sem permissão para excluir a imagem.", 403)
    images = images.filter(entry => entry.id !== image.id)
    requests = requests.filter(entry => entry.imageId !== image.id)
  } else if (action === "request-broadcast") {
    if (isGm) return error("O Mestre pode transmitir diretamente.")
    const image = images.find(entry => entry.id === body.imageId && entry.ownerId === user.id)
    if (!image) return error("Imagem não encontrada.", 404)
    if (isProtectedImage(image, folders, enabled) && !image.isPublic)
      return error("Libere a visibilidade da imagem antes de solicitar uma transmissão.", 403)
    if (requests.some(entry => entry.imageId === image.id && entry.requesterId === user.id))
      return error("Esta imagem já aguarda aprovação.", 409)
    const galleryRequest: GalleryBroadcastRequest = {
      id: genId("gallery_request"), imageId: image.id, imageName: image.name, imageUrl: image.url,
      requesterId: user.id, requesterName: user.name, createdAt: Date.now(),
    }
    requests.push(galleryRequest)
    await updateCampaignState(campaignId, { galleryBroadcastRequests: requests })
    publish(campaignId, { type: "gallery:broadcast-requested", requestId: galleryRequest.id })
    return NextResponse.json(galleryResponse(access))
  } else if (action === "resolve-broadcast") {
    if (!isGm) return error("Apenas o Mestre pode responder solicitações.", 403)
    const resolution = body.resolution === "approved" ? "approved" : body.resolution === "rejected" ? "rejected" : null
    if (!resolution) return error("Resposta inválida.")
    const galleryRequest = requests.find(entry => entry.id === body.requestId)
    if (!galleryRequest) return error("Solicitação não encontrada.", 404)
    const image = images.find(entry => entry.id === galleryRequest.imageId)
    if (resolution === "approved" && (!image || !canReadGalleryImage(image, folders, enabled, user.id, true)))
      return error("A imagem não está liberada para o Mestre.", 403)
    if (resolution === "approved" && targetUserId !== null &&
      (typeof targetUserId !== "string" || !targetUserId.trim() || getMemberRole(campaign, targetUserId) !== "player"))
      return error("Selecione um jogador válido desta campanha.")
    requests = requests.filter(entry => entry.id !== galleryRequest.id)
    await updateCampaignState(campaignId, { galleryBroadcastRequests: requests })
    publish(campaignId, { type: "gallery:broadcast-resolved", requestId: galleryRequest.id, requesterId: galleryRequest.requesterId, resolution })
    if (resolution === "approved" && image) showImage(campaignId, image, targetUserId)
    return NextResponse.json(galleryResponse(access))
  } else if (action === "broadcast") {
    if (!isGm) return error("Apenas o Mestre pode transmitir.", 403)
    if (targetUserId !== null &&
      (typeof targetUserId !== "string" || !targetUserId.trim() || getMemberRole(campaign, targetUserId) !== "player"))
      return error("Selecione um jogador válido desta campanha.")
    const image = images.find(entry => entry.id === body.imageId)
    if (!image) return error("Imagem não encontrada.", 404)
    if (!canReadGalleryImage(image, folders, enabled, user.id, true)) return error("Imagem protegida pelo dono.", 403)
    showImage(campaignId, image, targetUserId)
    return NextResponse.json(galleryResponse(access))
  } else {
    return error("Ação inválida.")
  }

  await updateCampaignState(campaignId, { gallery: images, galleryFolders: records, galleryBroadcastRequests: requests })
  publish(campaignId, { type: "gallery:changed" })
  return NextResponse.json(galleryResponse(access), { headers: { "Cache-Control": "private, no-store" } })
}
