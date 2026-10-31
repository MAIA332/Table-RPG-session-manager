/** Regras compartilhadas de autorização do Acervo Visual. Nunca confiar só no cadeado da UI. */
export const PRIVATE_FOLDERS_FLAG_ID = "__system:gallery-private-folders-enabled__"

export type GalleryPrivacyFolder = {
  id: string
  name?: string
  ownerId?: string
  ownerName?: string
  isPlayerFolder?: boolean
  privateFoldersEnabled?: boolean
}
export type GalleryPrivacyImage = {
  id: string
  folderId?: string
  ownerId?: string
  isPublic?: boolean
}

/** Configuração persistida no array galleryFolders já suportado pelo MongoDB.
 * O registro interno não é apresentado como pasta; não requer migração do schema.
 */
export function privateFoldersEnabled(folders: readonly GalleryPrivacyFolder[] | undefined): boolean {
  return Boolean(folders?.some(folder => folder?.id === PRIVATE_FOLDERS_FLAG_ID))
}

export function isPrivatePlayerFolder(folder: GalleryPrivacyFolder | undefined): boolean {
  return Boolean(folder && folder.id !== "root" && folder.id !== PRIVATE_FOLDERS_FLAG_ID &&
    (folder.isPlayerFolder || folder.id.startsWith("player:") || folder.ownerId))
}

export function isProtectedImage(
  image: GalleryPrivacyImage,
  folders: readonly GalleryPrivacyFolder[],
  enabled: boolean,
): boolean {
  return enabled && isPrivatePlayerFolder(folders.find(folder => folder.id === (image.folderId || "root")))
}

export function canReadGalleryImage(
  image: GalleryPrivacyImage,
  folders: readonly GalleryPrivacyFolder[],
  enabled: boolean,
  userId: string,
  isGm: boolean,
): boolean {
  if (image.ownerId === userId) return true
  if (isProtectedImage(image, folders, enabled)) return Boolean(image.isPublic)
  return isGm || Boolean(image.isPublic)
}

export function canManageGalleryImage(
  image: GalleryPrivacyImage,
  folders: readonly GalleryPrivacyFolder[],
  enabled: boolean,
  userId: string,
  isGm: boolean,
): boolean {
  if (image.ownerId === userId) return true
  return isGm && !isProtectedImage(image, folders, enabled)
}

export function canOpenGalleryFolder(
  folder: GalleryPrivacyFolder,
  images: readonly GalleryPrivacyImage[],
  enabled: boolean,
  userId: string,
  isGm: boolean,
): boolean {
  if (!isPrivatePlayerFolder(folder)) return true
  if (folder.ownerId === userId) return true
  if (!enabled && isGm) return true
  return images.some(image => image.folderId === folder.id && image.isPublic)
}

/** Imagens de pastas privadas só se tornam acessíveis ao Mestre quando o switch está desligado. */
export function visibleGalleryImages<T extends GalleryPrivacyImage>(
  images: readonly T[],
  folders: readonly GalleryPrivacyFolder[],
  enabled: boolean,
  userId: string,
  isGm: boolean,
): T[] {
  return images.filter(image => canReadGalleryImage(image, folders, enabled, userId, isGm))
}

/** Garante que uma substituição de catálogo GM não apague imagens/pastas invisíveis. */
export function preserveProtectedGalleryItems<T extends GalleryPrivacyImage, F extends GalleryPrivacyFolder>(
  savedImages: readonly T[],
  savedFolders: readonly F[],
  submittedImages: readonly T[],
  submittedFolders: readonly F[],
  enabled: boolean,
): { images: T[]; folders: F[] } {
  if (!enabled) return { images: [...submittedImages], folders: [...submittedFolders] }
  const protectedFolders = savedFolders.filter(isPrivatePlayerFolder)
  const protectedIds = new Set(protectedFolders.map(folder => folder.id))
  const submittedPublicFolders = submittedFolders.filter(folder => !protectedIds.has(folder.id))
  const publicImages = submittedImages.filter(image => !protectedIds.has(image.folderId || "root"))
  // Preservamos todos os registros protegidos, inclusive os que o Mestre não recebeu no GET.
  const privateImages = savedImages.filter(image => protectedIds.has(image.folderId || "root"))
  return {
    folders: [...submittedPublicFolders, ...protectedFolders],
    images: [...publicImages, ...privateImages],
  }
}
