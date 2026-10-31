import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import {
  CAMPAIGN_STATE_ARRAY_FIELDS,
  getCampaignState,
  getCampaignStateFields,
  updateCampaignState,
} from "@/lib/campaign-state"
import { getMemberRole, publish, store } from "@/lib/store"
import { getGalleryFolders, sanitizeBroadcastRequest } from "@/lib/gallery-server"
import {
  PRIVATE_FOLDERS_FLAG_ID,
  isPrivatePlayerFolder,
  preserveProtectedGalleryItems,
  privateFoldersEnabled,
  visibleGalleryImages,
} from "@/lib/gallery-privacy"
import type { GalleryBroadcastRequest, GalleryFolder, GalleryImage } from "@/lib/types"

export const dynamic = "force-dynamic"

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" }

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
  if (!campaign) {
    return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }
  }

  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }
  return { campaignId, campaign, role, user }
}

function galleryStateForViewer(access: Access, state: ReturnType<typeof getCampaignState>) {
  // Uma rota de estado não pode contornar a visibilidade protegida na rota /gallery.
  const folders = getGalleryFolders(access.campaign, state.galleryFolders)
  const enabled = privateFoldersEnabled(state.galleryFolders)
  const gallery = visibleGalleryImages(
    (Array.isArray(state.gallery) ? state.gallery : []) as GalleryImage[],
    folders,
    enabled,
    access.user.id,
    access.role === "gm",
  )
  const visibleImageIds = new Set(gallery.map(image => image.id))

  // As solicitações antigas guardam imageUrl e imageName; elas também precisam
  // ser filtradas para não entregar URLs privadas via GET ou resposta de POST.
  const galleryBroadcastRequests: GalleryBroadcastRequest[] = (
    Array.isArray(state.galleryBroadcastRequests)
      ? state.galleryBroadcastRequests
      : []
  )
    .map((entry: unknown) => sanitizeBroadcastRequest(entry))
    .filter(
      (entry): entry is GalleryBroadcastRequest => entry !== null
    )
    .filter((entry) => visibleImageIds.has(entry.imageId))

  return { gallery, folders, galleryBroadcastRequests }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getAccess(params)
  if ("error" in access) return access.error

  const state = getCampaignState(access.campaignId)
  const persistedFields = getCampaignStateFields(access.campaignId)
  const { gallery, folders, galleryBroadcastRequests } = galleryStateForViewer(access, state)

  if (access.role !== "gm") {
    return NextResponse.json({
      state: {
        gallery,
        lore: (Array.isArray(state.lore) ? state.lore : []).filter(
          (entry: any) => entry?.isPublic || entry?.allowedMembers?.includes(access.user.id),
        ),
        weather: state.weather,
        customEquipment: state.customEquipment || [],
        customClasses: state.customClasses || [],
        galleryFolders: folders,
        // Jogadores também precisam receber as pastas da loja.
        storeFolders: Array.isArray(state.storeFolders) ? state.storeFolders : [],
      },
      persistedFields,
    }, { headers: PRIVATE_NO_STORE })
  }

  return NextResponse.json({
    state: {
      ...state,
      gallery,
      galleryFolders: folders,
      galleryBroadcastRequests,
    },
    persistedFields,
  }, { headers: PRIVATE_NO_STORE })
}

/**
 * Compatibilidade com o POST genérico anterior:
 * - continua aceitando os mesmos arrays e campos de campanha;
 * - não permite que uma gravação antiga apague/edite pastas privadas;
 * - o switch é exclusivo da ação set-private-folders na rota /gallery.
 */
function protectGalleryPatch(
  access: Access,
  patch: Record<string, unknown>,
  current: ReturnType<typeof getCampaignState>,
): string | null {
  const changesImages = Array.isArray(patch.gallery)
  const changesFolders = Array.isArray(patch.galleryFolders)
  const changesRequests = Array.isArray(patch.galleryBroadcastRequests)
  if (!changesImages && !changesFolders && !changesRequests) return null

  const storedFolders = Array.isArray(current.galleryFolders)
    ? current.galleryFolders as GalleryFolder[]
    : []
  const storedImages = Array.isArray(current.gallery)
    ? current.gallery as GalleryImage[]
    : []
  const existingFolders = getGalleryFolders(access.campaign, storedFolders)
  const enabled = privateFoldersEnabled(storedFolders)

  if (changesFolders) {
    const incoming = patch.galleryFolders as GalleryFolder[]
    if (incoming.some(folder => !folder || typeof folder.id !== "string" || typeof folder.name !== "string")) {
      return "Pastas da galeria inválidas."
    }
  }
  if (changesImages) {
    const incoming = patch.gallery as GalleryImage[]
    if (incoming.some(image => !image || typeof image.id !== "string" || (image.folderId !== undefined && typeof image.folderId !== "string"))) {
      return "Imagens da galeria inválidas."
    }
  }

  // O mestre pode administrar as pastas comuns, mas não editar, excluir nem
  // deslocar os registros das pastas de jogadores quando a proteção está ativa.
  if (changesImages || changesFolders) {
    const incomingFolders = changesFolders
      ? (patch.galleryFolders as GalleryFolder[]).filter(folder =>
        folder.id !== "root" && folder.id !== PRIVATE_FOLDERS_FLAG_ID &&
        !folder.isPlayerFolder && !folder.id.startsWith("player:") &&
        (!enabled || !isPrivatePlayerFolder(folder)),
      )
      : existingFolders

    const incomingImages = changesImages
      ? patch.gallery as GalleryImage[]
      : storedImages

    // Identidades dos registros privados são imutáveis pelo POST genérico,
    // inclusive se a requisição tentar copiar uma imagem para a pasta pública.
    const privateFolderIds = new Set(existingFolders.filter(isPrivatePlayerFolder).map(folder => folder.id))
    const privateImageIds = new Set(storedImages
      .filter(image => privateFolderIds.has(image.folderId || "root"))
      .map(image => image.id))
    const safeIncomingImages = enabled
      ? incomingImages.filter(image => !privateImageIds.has(image.id))
      : incomingImages

    const merged = preserveProtectedGalleryItems(
      storedImages,
      existingFolders,
      safeIncomingImages,
      incomingFolders,
      enabled,
    )

    if (changesImages) patch.gallery = merged.images
    if (changesFolders) {
      // Não permitir ligar/desligar o switch por este endpoint. A confirmação
      // obrigatória fica na ação set-private-folders da API /gallery.
      const configRecord = storedFolders.filter(folder => folder.id === PRIVATE_FOLDERS_FLAG_ID)
      patch.galleryFolders = [
        ...merged.folders.filter(folder => folder.id !== "root" && !folder.isPlayerFolder &&
          folder.id !== PRIVATE_FOLDERS_FLAG_ID && !folder.id.startsWith("player:")),
        ...configRecord,
      ]
    }
  }

  if (changesRequests && enabled) {
    // Solicitações também carregam URLs de imagem. Uma substituição global
    // da interface não pode editar/remover as solicitações das pastas privadas.
    const protectedFolderIds = new Set(existingFolders.filter(isPrivatePlayerFolder).map(folder => folder.id))
    const protectedImageIds = new Set(storedImages
      .filter(image => protectedFolderIds.has(image.folderId || "root"))
      .map(image => image.id))
    const incomingRequests = patch.galleryBroadcastRequests as GalleryBroadcastRequest[]
    patch.galleryBroadcastRequests = [
      ...incomingRequests.filter(request => request && !protectedImageIds.has(request.imageId)),
      ...(Array.isArray(current.galleryBroadcastRequests)
        ? current.galleryBroadcastRequests
        : []
      )
        .map(sanitizeBroadcastRequest)
        .filter(
          (request): request is GalleryBroadcastRequest =>
            request !== null && protectedImageIds.has(request.imageId)
        ),
    ]
  }
  return null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getAccess(params)
  if ("error" in access) return access.error
  if (access.role !== "gm") {
    return NextResponse.json(
      { error: "Apenas o mestre pode salvar o estado da campanha." },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const source = body?.state
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}

  for (const field of CAMPAIGN_STATE_ARRAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      if (!Array.isArray(source[field])) {
        return NextResponse.json({ error: `Campo ${field} inválido.` }, { status: 400 })
      }
      patch[field] = source[field]
    }
  }

  if (Object.prototype.hasOwnProperty.call(source, "weather")) {
    if (typeof source.weather !== "string") {
      return NextResponse.json({ error: "Clima inválido." }, { status: 400 })
    }
    patch.weather = source.weather
  }

  if (Object.prototype.hasOwnProperty.call(source, "customCreatures")) {
    if (!Array.isArray(source.customCreatures)) {
      return NextResponse.json({ error: "Criaturas inválidas." }, { status: 400 })
    }
    patch.customCreatures = source.customCreatures
  }

  if (Object.prototype.hasOwnProperty.call(source, "customEquipment")) {
    if (!Array.isArray(source.customEquipment)) {
      return NextResponse.json({ error: "Itens inválidos." }, { status: 400 })
    }
    patch.customEquipment = source.customEquipment
  }

  if (Object.prototype.hasOwnProperty.call(source, "customClasses")) {
    if (!Array.isArray(source.customClasses)) {
      return NextResponse.json({ error: "Classes inválidas." }, { status: 400 })
    }
    patch.customClasses = source.customClasses
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nenhum campo persistente informado." }, { status: 400 })
  }

  const current = getCampaignState(access.campaignId)
  const privacyError = protectGalleryPatch(access, patch, current)
  if (privacyError) {
    return NextResponse.json({ error: privacyError }, { status: 400 })
  }

  const updated = await updateCampaignState(access.campaignId, patch)
  if ("gallery" in patch || "galleryFolders" in patch || "galleryBroadcastRequests" in patch) {
    publish(access.campaignId, { type: "gallery:changed" })
  }
  const { gallery, folders, galleryBroadcastRequests } = galleryStateForViewer(access, updated)

  // A resposta também deve ser filtrada. Nunca devolver o documento bruto com
  // URLs e solicitações ocultas para quem não pode vê-las.
  return NextResponse.json({
    success: true,
    state: {
      ...updated,
      gallery,
      galleryFolders: folders,
      galleryBroadcastRequests,
    },
    persistedFields: getCampaignStateFields(access.campaignId),
  }, { headers: PRIVATE_NO_STORE })
}
