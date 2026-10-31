"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Check, ChevronRight, Eye, EyeOff, Folder, FolderPlus, FolderLock, LockKeyhole, ShieldCheck, Image as ImageIcon, Loader2, Pencil, Plus, Search, Send, Trash2, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"

import type { GalleryBroadcastRequest, GalleryFolder, GalleryImage } from "@/lib/types"

import { createClientId } from "@/lib/client-id"
import { canOpenGalleryFolder, canManageGalleryImage, canReadGalleryImage, isPrivatePlayerFolder, type GalleryPrivacyFolder } from "@/lib/gallery-privacy"

export type SharedImage = GalleryImage

export type { GalleryFolder }

const ROOT_FOLDER: GalleryFolder = { id: "root", name: "Todas as imagens" }

// Renderização progressiva: apenas o lote visível entra no DOM.
const GALLERY_PAGE_SIZE = 24
const THUMBNAIL_WIDTH = 480
const THUMBNAIL_HEIGHT = 270
const MAX_CACHED_THUMBNAILS = 256
const MAX_PARALLEL_DECODES = 2

// Cache mantido no módulo: sobrevive ao fechamento/reabertura do Imagepad
// enquanto a aplicação permanecer aberta. Guarda miniaturas, nunca imagens
// originais em base64 e nunca grava conteúdo privado em localStorage.
const thumbnailCache = new Map<string, string>()
const thumbnailPending = new Map<string, Promise<string>>()
const activeThumbnailConsumers = new Map<string, number>()
const thumbnailQueue: Array<{ key: string; source: string; resolve: (url: string) => void }> = []
let decodingThumbnails = 0

function thumbnailKey(id: string, source: string): string {
  // Não usar a URL base64 inteira como chave: ela pode ter vários megabytes.
  return `${id}:${source.length}:${source.slice(0, 48)}:${source.slice(-64)}`
}

function readCachedThumbnail(key: string): string | undefined {
  const result = thumbnailCache.get(key)
  if (result) {
    // Atualiza a ordem do LRU sem guardar cópias extras do conteúdo.
    thumbnailCache.delete(key)
    thumbnailCache.set(key, result)
  }
  return result
}

function pruneThumbnailCache() {
  // Não libera URLs ainda exibidas em cards montados.
  for (const key of thumbnailCache.keys()) {
    if (thumbnailCache.size <= MAX_CACHED_THUMBNAILS) break
    if ((activeThumbnailConsumers.get(key) || 0) > 0) continue
    const url = thumbnailCache.get(key)
    thumbnailCache.delete(key)
    if (url) URL.revokeObjectURL(url)
  }
}

function saveCachedThumbnail(key: string, blobUrl: string) {
  const previous = thumbnailCache.get(key)
  if (previous && previous !== blobUrl) URL.revokeObjectURL(previous)
  thumbnailCache.delete(key)
  thumbnailCache.set(key, blobUrl)
  pruneThumbnailCache()
}

async function makeCompactThumbnail(source: string): Promise<string> {
  if (typeof createImageBitmap !== "function") return source
  const response = await fetch(source)
  const originalBlob = await response.blob()
  const bitmap = await createImageBitmap(originalBlob, {
    resizeWidth: THUMBNAIL_WIDTH,
    resizeQuality: "medium",
  })
  try {
    const width = THUMBNAIL_WIDTH
    const height = THUMBNAIL_HEIGHT
    const scale = Math.max(width / bitmap.width, height / bitmap.height)
    const dw = bitmap.width * scale
    const dh = bitmap.height * scale
    const dx = (width - dw) / 2
    const dy = (height - dh) / 2
    let output: Blob | null = null
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext("2d")
      if (!ctx) return source
      ctx.drawImage(bitmap, dx, dy, dw, dh)
      output = await canvas.convertToBlob({ type: "image/webp", quality: 0.76 })
    } else {
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return source
      ctx.drawImage(bitmap, dx, dy, dw, dh)
      output = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.76),
      )
    }
    return output ? URL.createObjectURL(output) : source
  } finally {
    bitmap.close()
  }
}

function pumpThumbnailQueue() {
  while (decodingThumbnails < MAX_PARALLEL_DECODES && thumbnailQueue.length) {
    const job = thumbnailQueue.shift()!
    decodingThumbnails += 1
    // O processamento começa em um período ocioso para priorizar cliques.
    const start = () => {
      void makeCompactThumbnail(job.source)
        .then((url) => {
          if (url.startsWith("blob:")) saveCachedThumbnail(job.key, url)
          job.resolve(url)
        })
        .catch(() => job.resolve(job.source))
        .finally(() => {
          thumbnailPending.delete(job.key)
          decodingThumbnails -= 1
          pumpThumbnailQueue()
        })
    }
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(start, { timeout: 700 })
    } else {
      setTimeout(start, 20)
    }
  }
}

function requestThumbnail(id: string, source: string): Promise<string> {
  if (!source.startsWith("data:image/")) return Promise.resolve(source)
  const key = thumbnailKey(id, source)
  const cached = readCachedThumbnail(key)
  if (cached) return Promise.resolve(cached)
  const pending = thumbnailPending.get(key)
  if (pending) return pending
  const promise = new Promise<string>((resolve) => {
    thumbnailQueue.push({ key, source, resolve })
  })
  thumbnailPending.set(key, promise)
  pumpThumbnailQueue()
  return promise
}

/** Uma miniatura não bloqueia os demais cards nem o clique para transmitir. */
const GalleryThumbnail = memo(function GalleryThumbnail({ image }: { image: SharedImage }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isDataUrl = image.url.startsWith("data:image/")
  const key = isDataUrl ? thumbnailKey(image.id, image.url) : ""
  const [src, setSrc] = useState<string | null>(() =>
    isDataUrl ? readCachedThumbnail(key) ?? null : null,
  )
  const [nearViewport, setNearViewport] = useState(false)

  useEffect(() => {
    if (!isDataUrl) return
    activeThumbnailConsumers.set(key, (activeThumbnailConsumers.get(key) || 0) + 1)
    return () => {
      const remaining = (activeThumbnailConsumers.get(key) || 1) - 1
      if (remaining > 0) activeThumbnailConsumers.set(key, remaining)
      else activeThumbnailConsumers.delete(key)
      pruneThumbnailCache()
    }
  }, [key, isDataUrl])

  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true)
          observer.disconnect()
        }
      },
      { rootMargin: "320px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [image.id, image.url])

  useEffect(() => {
    let active = true
    if (isDataUrl) setSrc(readCachedThumbnail(key) ?? null)
    else setSrc(null)
    if (nearViewport && isDataUrl) {
      void requestThumbnail(image.id, image.url).then((url) => {
        if (active) setSrc(url)
      })
    }
    return () => { active = false }
  }, [image.id, image.url, isDataUrl, key, nearViewport])

  const displayUrl = !isDataUrl ? (nearViewport ? image.url : null) : src
  return (
    <div ref={wrapperRef} className="absolute inset-0 overflow-hidden bg-black/80">
      {displayUrl ? (
        <img
          src={displayUrl}
          alt={image.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div aria-hidden="true" className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-900 to-stone-950">
          <ImageIcon className="size-7 text-primary/25" />
        </div>
      )}
    </div>
  )
})

type GalleryCardProps = {
  image: SharedImage
  isGm: boolean
  canManage: boolean
  isPending: boolean
  validTarget: boolean
  isShowing: boolean
  busyVisibility: boolean
  busyRequest: boolean
  busyDelete: boolean
  movableFolders: GalleryFolder[]
  onShow: (image: SharedImage) => void
  onToggle: (image: SharedImage) => void
  onMove: (image: SharedImage, folderId: string) => void
  onRequest: (image: SharedImage) => void
  onDelete: (image: SharedImage) => void
}

// Mantém os elementos de imagem independentes do estado do formulário/pastas.
const GalleryCard = memo(function GalleryCard({
  image, isGm, canManage, isPending, validTarget, isShowing,
  busyVisibility, busyRequest, busyDelete, movableFolders,
  onShow, onToggle, onMove, onRequest, onDelete,
}: GalleryCardProps) {
  return (
    <article className="rpg-gallery-card rpg-themed-card group overflow-hidden border border-white/10 bg-zinc-900 shadow-md">
      <button
        type="button"
        disabled={isShowing || (isGm && !validTarget)}
        onClick={() => onShow(image)}
        className="relative block aspect-video w-full overflow-hidden bg-black/80"
        aria-label={`Exibir ${image.name}`}
      >
        <GalleryThumbnail image={image} />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/60 group-hover:opacity-100">
          {isShowing ? <Loader2 className="size-7 animate-spin" /> : isGm ? <Send className="size-7" /> : <Eye className="size-7" />}
        </span>
        <span className={`absolute right-2 top-2 flex items-center gap-1 rounded bg-black/80 px-2 py-1 text-[9px] font-bold uppercase ${image.isPublic ? "text-green-400" : "text-zinc-400"}`}>
          {image.isPublic ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
          {image.isPublic ? "Pública" : "Privada"}
        </span>
      </button>
      <div className="flex items-center gap-2 border-t border-primary/15 bg-[#1b140f] p-3">
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm text-zinc-200">{image.name}</strong>
          <span className="block truncate text-[9px] text-muted-foreground">{image.ownerName || (isGm ? "Mestre" : "")}</span>
        </div>
        {canManage && <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" className={`size-8 p-0 ${image.isPublic ? "text-green-400" : "text-muted-foreground"}`}
            disabled={busyVisibility} onClick={() => onToggle(image)} title={image.isPublic ? "Tornar privada" : "Tornar pública"}>
            {busyVisibility ? <Loader2 className="size-4 animate-spin" /> : image.isPublic ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </Button>
          {movableFolders.length > 1 && <select aria-label={`Mover ${image.name} para pasta`} value={image.folderId || "root"} onChange={(event) => onMove(image, event.target.value)}
            className="h-8 max-w-28 rounded-sm border border-white/10 bg-black/50 px-1 text-[10px]">
            {movableFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>}
          {!isGm && <Button size="sm" variant="ghost" className="size-8 p-0 text-primary"
            disabled={isPending || busyRequest} onClick={() => onRequest(image)} title={isPending ? "Aguardando aprovação" : "Solicitar envio ao mestre"}>
            {busyRequest ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>}
          <Button size="sm" variant="ghost" className="size-8 p-0 text-red-400"
            disabled={busyDelete} onClick={() => onDelete(image)} title="Excluir imagem">
            {busyDelete ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </Button>
        </div>}
      </div>
      {!isGm && isPending && <div className="border-t border-amber-400/20 bg-amber-950/25 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-amber-300">Aguardando aprovação do mestre</div>}
    </article>
  )
})

const ensureHttps = (url = "") => {

  const clean = url.trim()

  return clean.toLowerCase().startsWith("http://") ? `https://${clean.slice(7)}` : clean

}

export function Imagepad({

  isGm,

  myUserId,

  players = [],

  targetingEnabled = false,

  images,

  folders,

  requests,

  onUpdateGallery,

  onAction,

  onShowImage,

  onClose,

}: {

  isGm: boolean

  myUserId: string

  players?: { userId: string; name: string }[]

  targetingEnabled?: boolean

  images: SharedImage[]

  folders: GalleryFolder[]

  requests: GalleryBroadcastRequest[]

  onUpdateGallery: (images: SharedImage[], folders: GalleryFolder[]) => void

  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>

  onShowImage: (image: SharedImage, targetUserId?: string | null) => void | Promise<void>

  onClose?: () => void

}) {

  const [targetUserId, setTargetUserId] = useState<string | null>(null)

  const validTarget = targetUserId === null || (targetingEnabled && players.some(player => player.userId === targetUserId))

  const [newName, setNewName] = useState("")

  const [newUrl, setNewUrl] = useState("")

  const [searchQuery, setSearchQuery] = useState("")

  const [activeFolderId, setActiveFolderId] = useState("root")

  const [showNewFolder, setShowNewFolder] = useState(false)

  const [newFolderName, setNewFolderName] = useState("")

  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [error, setError] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [pageLimit, setPageLimit] = useState(GALLERY_PAGE_SIZE)
  const [showingIds, setShowingIds] = useState<ReadonlySet<string>>(() => new Set())
  const showingRef = useRef(new Set<string>())


  const normalizedFolders = useMemo(() => {

    const list = Array.isArray(folders) ? folders : []

    return list.some((folder) => folder.id === "root") ? list : [ROOT_FOLDER, ...list]

  }, [folders])

  const privacyEnabled = Boolean((normalizedFolders.find(folder => folder.id === "root") as GalleryFolder & GalleryPrivacyFolder | undefined)?.privateFoldersEnabled)

  // Defesa adicional contra estado antigo vindo de cache/localStorage da campanha.
  // A autorização principal continua sendo feita no servidor.
  const normalizedImages = useMemo(
    () => (Array.isArray(images) ? images : [])
      .filter(image => canReadGalleryImage(image, normalizedFolders, privacyEnabled, myUserId, isGm))
      .map(image => ({ ...image, url: ensureHttps(image.url), folderId: image.folderId || "root" })),
    [images, normalizedFolders, privacyEnabled, myUserId, isGm],
  )
  const ownFolder = normalizedFolders.find(folder => folder.ownerId === myUserId && folder.isPlayerFolder)
  const mayCreateFolder = isGm || privacyEnabled
  const mayEditFolder = (folder: GalleryFolder) => {
    if (folder.id === "root" || folder.isPlayerFolder) return false
    if (folder.ownerId === myUserId) return true
    return isGm && (!privacyEnabled || !isPrivatePlayerFolder(folder))
  }
  const folderCanOpen = (folder: GalleryFolder) => canOpenGalleryFolder(folder, normalizedImages, privacyEnabled, myUserId, isGm)
  const mayUploadHere = (folder: GalleryFolder) => isGm
    ? (!privacyEnabled || !isPrivatePlayerFolder(folder))
    : folder.ownerId === myUserId
  // Referência estável para não remontar centenas de cards ao alterar o switch.
  const movableFolders = useMemo(() => normalizedFolders.filter(folder => isGm
    ? (!privacyEnabled || !isPrivatePlayerFolder(folder))
    : folder.ownerId === myUserId,
  ), [normalizedFolders, privacyEnabled, isGm, myUserId])

  useEffect(() => {

    if (!normalizedFolders.some(folder => folder.id === activeFolderId && folderCanOpen(folder))) setActiveFolderId("root")

  }, [activeFolderId, normalizedFolders, normalizedImages, privacyEnabled])

  const visibleImages = useMemo(() => {

    const query = searchQuery.trim().toLowerCase()

    return normalizedImages.filter((image) =>

      (activeFolderId === "root" || image.folderId === activeFolderId) &&

      (!query || image.name.toLowerCase().includes(query)),

    )

  }, [activeFolderId, normalizedImages, searchQuery])

  useEffect(() => { setPageLimit(GALLERY_PAGE_SIZE) }, [activeFolderId, searchQuery])

  const renderedImages = useMemo(
    () => visibleImages.slice(0, pageLimit),
    [visibleImages, pageLimit],
  )

  useEffect(() => {
    const sentinel = loadMoreRef.current
    const scrollArea = gridRef.current
    if (!sentinel || !scrollArea || pageLimit >= visibleImages.length) return
    if (typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        setPageLimit(current => Math.min(current + GALLERY_PAGE_SIZE, visibleImages.length))
      }
    }, { root: scrollArea, rootMargin: "450px" })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [pageLimit, visibleImages.length, activeFolderId, searchQuery])

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const image of normalizedImages) {
      const id = image.folderId || "root"
      counts.set(id, (counts.get(id) || 0) + 1)
    }
    return counts
  }, [normalizedImages])

  const pendingIds = useMemo(() => new Set(
    requests.filter(request => request.requesterId === myUserId).map(request => request.imageId),
  ), [requests, myUserId])

  const activeFolder = normalizedFolders.find((folder) => folder.id === activeFolderId) || ROOT_FOLDER

  const canManageImage = (image: SharedImage) => canManageGalleryImage(image, normalizedFolders, privacyEnabled, myUserId, isGm)

  const isPending = (imageId: string) => requests.some((request) => request.imageId === imageId && request.requesterId === myUserId)

  async function showImage(image: SharedImage) {
    // Somente a mesma imagem fica bloqueada enquanto é enviada. O envio
    // independe de qualquer outra miniatura ainda não carregada.
    if (showingRef.current.has(image.id)) return
    if (isGm && !validTarget) {
      setError("Selecione um jogador válido; o servidor precisa permitir o envio individual.")
      return
    }
    showingRef.current.add(image.id)
    setShowingIds(new Set(showingRef.current))
    setError("")
    try {
      await onShowImage(image, isGm ? targetUserId : null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível exibir a imagem.")
    } finally {
      showingRef.current.delete(image.id)
      setShowingIds(new Set(showingRef.current))
    }
  }

  async function runAction(key: string, action: string, payload?: Record<string, unknown>) {

    if (action === "resolve-broadcast" && payload?.resolution === "approved") {

      if (!isGm || !validTarget) {

        setError("Selecione um jogador válido para a transmissão.")

        return

      }

      payload = { ...payload, targetUserId }

    }

    setBusyKey(key)

    setError("")

    try {

      await onAction(action, payload)

    } catch (cause) {

      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação.")

    } finally {

      setBusyKey(null)

    }

  }

  function updateForGm(nextImages: SharedImage[], nextFolders = normalizedFolders) {

    if (!isGm) return

    onUpdateGallery(nextImages, nextFolders)

  }

  async function addImage(urlOverride?: string) {

    const name = newName.trim()

    const url = ensureHttps(urlOverride || newUrl)

    if (!name || !url) {

      setError("Informe o nome e a imagem.")

      return

    }

    if (!/^https:\/\//i.test(url) && !url.startsWith("data:image/")) {

      setError("Use uma URL HTTPS válida ou escolha um arquivo de imagem.")

      return

    }

    if (!mayUploadHere(activeFolder)) { setError("Esta pasta está protegida. Selecione uma pasta sua ou uma pasta pública."); return }
    const folderId = activeFolderId === "root" && !isGm ? ownFolder?.id || "root" : activeFolderId

    const image: SharedImage = { id: createClientId(), name, url, isPublic: false, folderId, ownerId: myUserId, createdAt: Date.now() }

    if (isGm) updateForGm([...normalizedImages, image])

    else await runAction("add", "add", { image })

    setNewName("")

    setNewUrl("")

    if (!isGm && activeFolderId === "root" && ownFolder) setActiveFolderId(ownFolder.id)

  }

  function selectFile(file?: File) {

    if (!file) return

    if (!file.type.startsWith("image/")) return setError("Selecione um arquivo de imagem.")

    if (file.size > 3 * 1024 * 1024) return setError("A imagem deve ter no máximo 3 MB.")

    if (!newName.trim()) setNewName(file.name.replace(/\.[^.]+$/, ""))

    const reader = new FileReader()

    reader.onload = () => setNewUrl(String(reader.result || ""))

    reader.onerror = () => setError("Não foi possível ler o arquivo.")

    reader.readAsDataURL(file)

  }

  function createFolder() {

    const name = newFolderName.trim()

    if (!mayCreateFolder || !name) return
    if (normalizedFolders.some(folder => folder.name.trim().toLowerCase() === name.toLowerCase())) return setError("Já existe uma pasta com esse nome.")
    if (isGm) {
      const folder = { id: createClientId(), name }
      updateForGm(normalizedImages, [...normalizedFolders, folder])
      setActiveFolderId(folder.id)
    } else {
      void runAction("create-folder", "create-folder", { name })
    }
    setNewFolderName("")
    setShowNewFolder(false)

  }

  function renameFolder(folder: GalleryFolder) {

    if (!mayEditFolder(folder)) return

    const name = window.prompt("Novo nome da pasta:", folder.name)?.trim()

    if (!name) return

    if (normalizedFolders.some((entry) => entry.id !== folder.id && entry.name.toLowerCase() === name.toLowerCase())) return setError("Já existe uma pasta com esse nome.")

    if (isGm) updateForGm(normalizedImages, normalizedFolders.map(entry => entry.id === folder.id ? { ...entry, name } : entry))
    else void runAction(`folder:${folder.id}`, "rename-folder", { folderId: folder.id, name })

  }

  function deleteFolder(folder: GalleryFolder) {

    if (!mayEditFolder(folder)) return

    if (!window.confirm(`Excluir a pasta "${folder.name}"? As imagens serão movidas para Todas as imagens.`)) return

    if (isGm) updateForGm(
      normalizedImages.map(image => image.folderId === folder.id ? { ...image, folderId: folder.ownerId ? `player:${folder.ownerId}` : "root" } : image),
      normalizedFolders.filter(entry => entry.id !== folder.id),
    )
    else void runAction(`folder:${folder.id}`, "delete-folder", { folderId: folder.id })

    setActiveFolderId("root")

  }

  function count(folderId: string) {

    return folderId === "root" ? normalizedImages.length : (folderCounts.get(folderId) || 0)

  }

  // Funções estáveis: marcar uma miniatura como pronta não reconstrói todos os
  // cards nem troca seus handlers. O ref mantém os dados atuais do catálogo.
  const cardActions = useRef<{
    show: (image: SharedImage) => void
    toggle: (image: SharedImage) => void
    move: (image: SharedImage, folderId: string) => void
    request: (image: SharedImage) => void
    remove: (image: SharedImage) => void
  }>({ show: () => {}, toggle: () => {}, move: () => {}, request: () => {}, remove: () => {} })
  cardActions.current = {
    show: image => { void showImage(image) },
    toggle: image => {
      if (isGm && !privacyEnabled) updateForGm(normalizedImages.map(entry => entry.id === image.id ? { ...entry, isPublic: !entry.isPublic } : entry))
      else void runAction(`visibility:${image.id}`, "toggle-public", { imageId: image.id })
    },
    move: (image, folderId) => {
      if (isGm) updateForGm(normalizedImages.map(entry => entry.id === image.id ? { ...entry, folderId } : entry))
      else void runAction(`move:${image.id}`, "move", { imageId: image.id, folderId })
    },
    request: image => { void runAction(`send:${image.id}`, "request-broadcast", { imageId: image.id }) },
    remove: image => {
      if (isGm && !privacyEnabled) updateForGm(normalizedImages.filter(entry => entry.id !== image.id))
      else void runAction(`delete:${image.id}`, "delete", { imageId: image.id })
    },
  }
  const cardShow = useCallback((image: SharedImage) => cardActions.current.show(image), [])
  const cardToggle = useCallback((image: SharedImage) => cardActions.current.toggle(image), [])
  const cardMove = useCallback((image: SharedImage, folderId: string) => cardActions.current.move(image, folderId), [])
  const cardRequest = useCallback((image: SharedImage) => cardActions.current.request(image), [])
  const cardDelete = useCallback((image: SharedImage) => cardActions.current.remove(image), [])

  return (

    <div className="rpg-themed-workspace flex h-full min-h-0 flex-col overflow-hidden bg-[#15100c] p-4 text-foreground sm:p-6">

      <header className="mb-4 flex shrink-0 items-start justify-between gap-4 border-b border-primary/25 pb-4">

        <div className="min-w-0 flex-1">

          <span className="rpg-kicker mb-1">Acervo visual</span>

          <h2 className="rpg-title flex items-center gap-2 text-2xl font-black"><ImageIcon className="size-6" /> Galeria arcana</h2>

          <p className="mt-1 text-sm text-muted-foreground">{isGm ? "Crie pastas, organize imagens e aprove solicitações dos jogadores." : "Use sua pasta pessoal para publicar imagens e solicitar uma transmissão."}</p>

          <div className="relative mt-3 max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar imagem por nome..." className="w-full rounded-sm border border-white/10 bg-black/40 py-2 pl-9 pr-4 text-sm outline-none focus:border-primary" /></div>

        </div>

        {onClose && <button type="button" onClick={onClose} className="rounded-sm border border-border/50 bg-black/20 p-2 hover:border-primary/60"><X className="size-5" /></button>}

      </header>

      {error && <div className="mb-3 flex shrink-0 items-center justify-between rounded-sm border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200"><span>{error}</span><button onClick={() => setError("")}><X className="size-4" /></button></div>}

      {isGm && <section className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.035] p-3 sm:p-4" aria-label="Proteção das pastas de jogadores">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><LockKeyhole className="size-4" /></span>
          <div><p className="text-xs font-bold text-foreground">Pastas privadas dos jogadores</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{privacyEnabled ? "Ativo: somente os donos abrem conteúdos não liberados, inclusive perante o Mestre." : "Desligado: o Mestre pode acessar e editar todas as pastas; demais jogadores continuam vendo apenas imagens liberadas."}</p></div>
        </div>
        <button role="switch" type="button" aria-label="Habilitar pastas privadas" aria-checked={privacyEnabled} disabled={!!busyKey}
          onClick={() => {
            if (privacyEnabled && !window.confirm("Desativar pastas privadas? O Mestre terá acesso imediato a TODAS as imagens e poderá editar e excluir conteúdos antes protegidos. Outros jogadores continuarão vendo só as imagens liberadas. Deseja continuar?")) return
            void runAction("privacy-toggle", "set-private-folders", { enabled: !privacyEnabled, confirmed: true })
          }}
          className={`relative h-7 w-14 shrink-0 rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${privacyEnabled ? "border-primary bg-primary/80" : "border-border bg-muted"}`}>
          <span className={`absolute top-[3px] size-5 rounded-full bg-white shadow-sm transition-all ${privacyEnabled ? "left-[30px]" : "left-[3px]"}`} />
        </button>
      </section>}

      {isGm && <section className="mb-4 shrink-0 rounded-sm border border-primary/25 bg-black/25 p-3">

        <label className="block text-sm font-bold">

          Quem verá a imagem?

          <select aria-label="Destinatário da imagem" value={targetUserId ?? ""} disabled={!!busyKey}

            onChange={event => setTargetUserId(event.target.value || null)}

            className="mt-2 w-full rounded-sm border border-white/15 bg-zinc-900 p-2 text-sm">

            <option value="">Todos na mesa</option>

            {players.map(player => <option key={player.userId} value={player.userId} disabled={!targetingEnabled}>{player.name}</option>)}

          </select>

        </label>

        <p className="mt-2 text-xs text-muted-foreground">{targetUserId ? "A imagem abrirá para o jogador escolhido e para o mestre que enviou." : "A imagem abrirá para todos na mesa, incluindo o mestre."} A seleção também vale ao aprovar solicitações.</p>

        <p className="mt-1 text-xs text-muted-foreground">O envio não altera a visibilidade da imagem na galeria. Para mantê-la fora da galeria dos demais, deixe-a privada.</p>

        {!targetingEnabled && <p role="status" className="mt-1 text-xs text-amber-300">Envio individual aguardando suporte do servidor.</p>}

        {!validTarget && <p role="alert" className="mt-1 text-xs text-red-300">O destinatário não está disponível. Selecione novamente.</p>}

      </section>}

      {isGm && requests.length > 0 && <section className="mb-4 shrink-0 rounded-sm border border-amber-400/40 bg-amber-950/25 p-3">

        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300"><Send className="size-4" /> Solicitações de envio ({requests.length})</div>

        <div className="flex gap-2 overflow-x-auto pb-1">{requests.map((request) => <div key={request.id} className="flex min-w-64 items-center gap-3 rounded-sm border border-white/10 bg-black/30 p-2"><img src={request.imageUrl} alt="" loading="lazy" decoding="async" className="size-12 rounded object-cover" /><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{request.imageName}</strong><span className="text-xs text-muted-foreground">{request.requesterName}</span></div><button disabled={!!busyKey} onClick={() => runAction(request.id, "resolve-broadcast", { requestId: request.id, resolution: "approved" })} className="rounded bg-green-500/15 p-2 text-green-400" title={targetUserId ? "Aprovar e enviar ao jogador selecionado" : "Aprovar e enviar para todos"}><Check className="size-4" /></button><button disabled={!!busyKey} onClick={() => runAction(request.id, "resolve-broadcast", { requestId: request.id, resolution: "rejected" })} className="rounded bg-red-500/15 p-2 text-red-400" title="Recusar"><X className="size-4" /></button></div>)}</div>

      </section>}

      <div className="flex min-h-0 flex-1 gap-4">

        <aside className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-sm border border-primary/20 bg-black/20 md:flex">

          <div className="flex items-center justify-between border-b border-primary/15 p-3"><span className="text-xs font-black uppercase tracking-widest">Pastas</span>{mayCreateFolder && <Button size="sm" variant="ghost" className="size-8 p-0" onClick={() => setShowNewFolder(true)} title="Nova pasta"><FolderPlus className="size-4" /></Button>}</div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar-sepia">
            {normalizedFolders.map(folder => {
              const owned = folder.ownerId === myUserId
              const protectedFolder = isPrivatePlayerFolder(folder) && (privacyEnabled || !isGm)
              const openable = folderCanOpen(folder)
              return <div key={folder.id} className={`group mb-1 flex items-center rounded-lg border ${activeFolderId === folder.id ? "border-primary/35 bg-primary/15 text-primary" : "border-transparent hover:border-border/50 hover:bg-white/5"}`}>
                <button type="button" disabled={!openable} aria-label={`${folder.name}${openable ? "" : ", pasta bloqueada"}`} title={openable ? folder.name : "Pasta privada: nenhuma imagem liberada pelo dono"}
                  onClick={() => setActiveFolderId(folder.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-55">
                  {protectedFolder && !owned ? <FolderLock className="size-4 shrink-0 text-primary/65" /> : <Folder className="size-4 shrink-0" />}
                  <span className="min-w-0 flex-1"><span className="block truncate">{folder.id === "root" ? "Todas as imagens" : folder.name}</span>
                    {folder.ownerId && <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">por {(folder as GalleryFolder & GalleryPrivacyFolder).ownerName || players.find(player => player.userId === folder.ownerId)?.name || (owned ? "Você" : "Jogador")}</span>}
                  </span>
                  {protectedFolder && !owned && <LockKeyhole className="size-3 shrink-0 text-muted-foreground" />}
                  <span className="text-[10px] text-muted-foreground">{openable ? count(folder.id) : "—"}</span>
                </button>
                {mayEditFolder(folder) && <div className="mr-1 flex gap-1 opacity-60 transition hover:opacity-100 group-focus-within:opacity-100"><button type="button" aria-label={`Renomear ${folder.name}`} onClick={() => renameFolder(folder)}><Pencil className="size-3" /></button><button type="button" aria-label={`Excluir ${folder.name}`} onClick={() => deleteFolder(folder)} className="text-red-400"><Trash2 className="size-3" /></button></div>}
              </div>
            })}
          </div>

          {mayCreateFolder && showNewFolder && <div className="border-t border-primary/15 p-3"><input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createFolder()} placeholder="Nome da pasta..." className="mb-2 w-full rounded-sm border border-white/10 bg-black/40 p-2 text-xs outline-none" /><div className="flex gap-2"><Button size="sm" variant="magical" className="flex-1" onClick={createFolder}>Criar</Button><Button size="sm" variant="ghost" onClick={() => setShowNewFolder(false)}>Cancelar</Button></div></div>}

        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

          <div className="mb-3 flex shrink-0 items-center gap-2 overflow-x-auto pb-1 md:hidden">{normalizedFolders.map(folder => {
            const openable = folderCanOpen(folder)
            const protectedFolder = isPrivatePlayerFolder(folder) && (privacyEnabled || !isGm) && folder.ownerId !== myUserId
            return <button key={folder.id} type="button" disabled={!openable} onClick={() => setActiveFolderId(folder.id)} className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${activeFolderId === folder.id ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 bg-black/20"}`}>
              {protectedFolder ? <FolderLock className="size-3.5" /> : <Folder className="size-3.5" />}
              <span className="flex flex-col items-start"><span>{folder.id === "root" ? "Todas" : folder.name}</span>{folder.ownerId && <small className="text-[9px] font-normal text-muted-foreground">{(folder as GalleryFolder & GalleryPrivacyFolder).ownerName || "Jogador"}</small>}</span>
              {protectedFolder && <LockKeyhole className="size-3" />}
            </button>
          })}{mayCreateFolder && <button type="button" onClick={() => setShowNewFolder(true)} className="rounded-sm border border-primary/30 p-2"><FolderPlus className="size-4" /></button>}</div>

          <div className="mb-3 flex shrink-0 items-center gap-2 text-sm font-bold">{isPrivatePlayerFolder(activeFolder) && (privacyEnabled || !isGm) ? <LockKeyhole className="size-5 text-primary" /> : <Folder className="size-5 text-primary" />}<span className="truncate">{activeFolder.name}</span><ChevronRight className="size-4 text-muted-foreground" /><span className="text-xs font-normal text-muted-foreground">{visibleImages.length} imagem(ns)</span>{activeFolder.ownerId && <span className="ml-auto hidden items-center gap-1 text-[10px] font-normal text-muted-foreground sm:inline-flex"><ShieldCheck className="size-3"/> Pasta de {(activeFolder as GalleryFolder & GalleryPrivacyFolder).ownerName || "jogador"}</span>}</div>

          {mayUploadHere(activeFolder) && <div className="panel mb-4 flex shrink-0 flex-col gap-2 rounded-sm border border-primary/20 p-3 sm:flex-row">

            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome da imagem" className="min-w-0 flex-1 rounded-sm border border-white/10 bg-black/40 p-2 text-sm outline-none" />

            <input value={newUrl.startsWith("data:image/") ? "Arquivo carregado" : newUrl} readOnly={newUrl.startsWith("data:image/")} onChange={(event) => setNewUrl(event.target.value)} placeholder="URL HTTPS ou escolha um arquivo" className="min-w-0 flex-1 rounded-sm border border-white/10 bg-black/40 p-2 text-sm outline-none" />

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => selectFile(event.target.files?.[0])} />

            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} title="Escolher arquivo"><Upload className="size-4" /></Button>

            <Button type="button" variant="magical" disabled={busyKey === "add"} onClick={() => void addImage()}>{busyKey === "add" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}Adicionar</Button>

          </div>}

          <div ref={gridRef} className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 content-start gap-5 overflow-y-auto pb-10 pr-2 custom-scrollbar-sepia sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {renderedImages.map(image => (
              <GalleryCard
                key={image.id}
                image={image}
                isGm={isGm}
                canManage={canManageImage(image)}
                isPending={pendingIds.has(image.id)}
                validTarget={validTarget}
                isShowing={showingIds.has(image.id)}
                busyVisibility={busyKey === `visibility:${image.id}`}
                busyRequest={busyKey === `send:${image.id}`}
                busyDelete={busyKey === `delete:${image.id}`}
                movableFolders={movableFolders}
                onShow={cardShow}
                onToggle={cardToggle}
                onMove={cardMove}
                onRequest={cardRequest}
                onDelete={cardDelete}
              />
            ))}
            {visibleImages.length > renderedImages.length && (
              <div ref={loadMoreRef} className="col-span-full flex h-12 items-center justify-center gap-2 text-xs text-muted-foreground" aria-label="Carregando mais imagens">
                <Loader2 className="size-3 animate-spin" /> Mais imagens ao rolar
                {typeof IntersectionObserver === "undefined" && (
                  <button type="button" className="ml-2 underline" onClick={() => setPageLimit(limit => limit + GALLERY_PAGE_SIZE)}>Carregar mais</button>
                )}
              </div>
            )}
            {visibleImages.length === 0 && <div className="col-span-full flex flex-col items-center py-16 text-muted-foreground"><Folder className="mb-3 size-8 opacity-20" /><span className="italic">Nenhuma imagem nesta pasta.</span></div>}
          </div>

        </main>

      </div>

      {mayCreateFolder && showNewFolder && (

        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/75 p-4 md:hidden" onClick={() => setShowNewFolder(false)}>

          <div className="w-full max-w-sm rounded-sm border border-primary/30 bg-[#15100c] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>

            <div className="mb-3 flex items-center justify-between"><strong className="flex items-center gap-2"><FolderPlus className="size-5 text-primary" /> Nova pasta</strong><button onClick={() => setShowNewFolder(false)}><X className="size-4" /></button></div>

            <input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createFolder()} placeholder="Nome da pasta..." className="mb-3 w-full rounded-sm border border-white/10 bg-black/40 p-2 text-sm outline-none" />

            <div className="flex gap-2"><Button variant="magical" className="flex-1" onClick={createFolder}>Criar</Button><Button variant="ghost" onClick={() => setShowNewFolder(false)}>Cancelar</Button></div>

          </div>

        </div>

      )}

    </div>

  )

}
