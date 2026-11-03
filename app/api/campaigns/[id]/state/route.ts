import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { CAMPAIGN_STATE_ARRAY_FIELDS, getCampaignState, getCampaignStateFields, updateCampaignState } from "@/lib/campaign-state"
import { getMemberRole, store } from "@/lib/store"
import { getGalleryFolders } from "@/lib/gallery-server"
import {
  PRIVATE_FOLDERS_FLAG_ID, privateFoldersEnabled, isPrivatePlayerFolder,
  preserveProtectedGalleryItems, visibleGalleryImages,
} from "@/lib/gallery-privacy"
import type { GalleryImage, GalleryFolder } from "@/lib/types"
import type { GameClass } from "@/lib/game-data"
import { visibleCustomClassesForUser, validateClassAudiences } from "@/lib/class-audience"

async function getAccess(params: Promise<{ id: string }>) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }
  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }
  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }
  return { campaignId, role, user, campaign }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  // A visão global não inclui classes concedidas só a uma ficha. O contexto
  // opcional precisa ser validado antes de expor definições restritas.
  const requestedCharacterId = new URL(request.url).searchParams.get("characterId")
  const requestedCharacter = requestedCharacterId ? store.characters.get(requestedCharacterId) : null
  if (requestedCharacterId && (!requestedCharacter || requestedCharacter.campaignId !== access.campaignId ||
    (access.role !== "gm" && requestedCharacter.ownerId !== access.user!.id))) {
    return NextResponse.json({ error: "Personagem não autorizado." }, { status: 403 })
  }
  const state = getCampaignState(access.campaignId!)
  const persistedFields = getCampaignStateFields(access.campaignId!)
  const folders = getGalleryFolders(access.campaign!, state.galleryFolders)
  const enabled = privateFoldersEnabled(state.galleryFolders)
  // O endpoint de estado também precisa seguir as mesmas regras da rota gallery.
  // Caso contrário, o payload completo permitiria contornar o cadeado.
  const gallery = visibleGalleryImages(state.gallery as GalleryImage[], folders, enabled, access.user!.id, access.role === "gm")

  if (access.role !== "gm") {
    return NextResponse.json({
      state: {
        gallery,
        lore: state.lore.filter((entry: any) => entry?.isPublic || entry?.allowedMembers?.includes(access.user!.id)),
        weather: state.weather,
        customEquipment: state.customEquipment || [],
        customClasses: visibleCustomClassesForUser((state.customClasses || []) as GameClass[], access.user!.id, false, requestedCharacter?.id),
        galleryFolders: folders,
        storeFolders: Array.isArray(state.storeFolders) ? state.storeFolders : [],
      },
      persistedFields,
    }, { headers: { "Cache-Control": "private, no-store" } })
  }

  // Solicitações antigas podem carregar URL em imageUrl; não revelá-las por esta rota.
  const accessibleIds = new Set(gallery.map(image => image.id))
  const galleryBroadcastRequests = (state.galleryBroadcastRequests || []).filter((entry: any) => accessibleIds.has(entry?.imageId))
  return NextResponse.json({
    state: { ...state, gallery, galleryBroadcastRequests, galleryFolders: folders },
    persistedFields,
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  if (access.role !== "gm") return NextResponse.json({ error: "Apenas o Mestre pode salvar o estado da campanha." }, { status: 403 })
  const body = await request.json().catch(() => null)
  const source = body?.state
  if (!source || typeof source !== "object" || Array.isArray(source))
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const field of CAMPAIGN_STATE_ARRAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      if (!Array.isArray(source[field])) return NextResponse.json({ error: `Campo ${field} inválido.` }, { status: 400 })
      patch[field] = source[field]
    }
  }
  if (Object.prototype.hasOwnProperty.call(source, "weather")) {
    if (typeof source.weather !== "string") return NextResponse.json({ error: "Clima inválido." }, { status: 400 })
    patch.weather = source.weather
  }
  if (Object.prototype.hasOwnProperty.call(source, "customCreatures")) {
    if (!Array.isArray(source.customCreatures)) return NextResponse.json({ error: "Criaturas inválidas." }, { status: 400 })
    patch.customCreatures = source.customCreatures
  }
  if (Object.prototype.hasOwnProperty.call(source, "customEquipment")) {
    if (!Array.isArray(source.customEquipment)) return NextResponse.json({ error: "Itens inválidos." }, { status: 400 })
    patch.customEquipment = source.customEquipment
  }
  if (Object.prototype.hasOwnProperty.call(source, "customClasses")) {
    if (!Array.isArray(source.customClasses)) return NextResponse.json({ error: "Classes inválidas." }, { status: 400 })
    const playerIds = new Set(access.campaign!.members.filter(member => member.role === "player").map(member => member.userId))
    const characterIds = new Set([...store.characters.values()]
      .filter(character => character.campaignId === access.campaignId && playerIds.has(character.ownerId))
      .map(character => character.id))
    const audienceError = validateClassAudiences(source.customClasses, playerIds, characterIds)
    if (audienceError) return NextResponse.json({ error: audienceError }, { status: 400 })
    patch.customClasses = source.customClasses
  }

  // Uma gravação antiga da tela de estado não pode revelar/substituir registros
  // protegidos, nem remover silenciosamente o switch que pertence à rota gallery.
  const current = getCampaignState(access.campaignId!)
  const enabled = privateFoldersEnabled(current.galleryFolders)
  if (Array.isArray(patch.gallery) || Array.isArray(patch.galleryFolders)) {
    const savedFolders = getGalleryFolders(access.campaign!, current.galleryFolders)
    const incomingFolders = ((patch.galleryFolders as GalleryFolder[] | undefined) ?? savedFolders)
      .filter(folder => folder.id !== PRIVATE_FOLDERS_FLAG_ID)
    const incomingImages = (patch.gallery as GalleryImage[] | undefined) ?? current.gallery as GalleryImage[]
    const protectedIds = new Set(savedFolders.filter(isPrivatePlayerFolder).map(folder => folder.id))
    const savedProtectedImageIds = new Set((current.gallery as GalleryImage[])
      .filter(image => protectedIds.has(image.folderId || "root")).map(image => image.id))
    const safeImages = enabled ? incomingImages.filter(image => !savedProtectedImageIds.has(image.id)) : incomingImages
    const merged = preserveProtectedGalleryItems(
      current.gallery as GalleryImage[], savedFolders, safeImages,
      enabled ? incomingFolders.filter(folder => !folder.ownerId || protectedIds.has(folder.id)) : incomingFolders,
      enabled,
    )
    if (Array.isArray(patch.gallery)) patch.gallery = merged.images
    if (Array.isArray(patch.galleryFolders)) {
      patch.galleryFolders = [
        ...merged.folders.filter(folder => folder.id !== "root" && !folder.isPlayerFolder),
        ...current.galleryFolders.filter(folder => folder.id === PRIVATE_FOLDERS_FLAG_ID),
      ]
    }
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nenhum campo persistente informado." }, { status: 400 })
  const state = await updateCampaignState(access.campaignId!, patch)
  const visible = visibleGalleryImages(state.gallery as GalleryImage[], getGalleryFolders(access.campaign!, state.galleryFolders), privateFoldersEnabled(state.galleryFolders), access.user!.id, true)
  const accessibleIds = new Set(visible.map(image => image.id))
  return NextResponse.json({ success: true, state: {
    ...state,
    gallery: visible,
    galleryBroadcastRequests: (state.galleryBroadcastRequests || []).filter((entry: any) => accessibleIds.has(entry?.imageId)),
    galleryFolders: getGalleryFolders(access.campaign!, state.galleryFolders),
  }, persistedFields: getCampaignStateFields(access.campaignId!) })
}
