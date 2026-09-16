"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronRight, Eye, EyeOff, Folder, FolderPlus, Image as ImageIcon, Loader2, Pencil, Plus, Search, Send, Trash2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { GalleryBroadcastRequest, GalleryFolder, GalleryImage } from "@/lib/types"

export type SharedImage = GalleryImage
export type { GalleryFolder }

const ROOT_FOLDER: GalleryFolder = { id: "root", name: "Todas as imagens" }

const ensureHttps = (url = "") => {
  const clean = url.trim()
  return clean.toLowerCase().startsWith("http://") ? `https://${clean.slice(7)}` : clean
}

export function Imagepad({
  isGm,
  myUserId,
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
  images: SharedImage[]
  folders: GalleryFolder[]
  requests: GalleryBroadcastRequest[]
  onUpdateGallery: (images: SharedImage[], folders: GalleryFolder[]) => void
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>
  onShowImage: (image: SharedImage) => void
  onClose?: () => void
}) {
  const [newName, setNewName] = useState("")
  const [newUrl, setNewUrl] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFolderId, setActiveFolderId] = useState("root")
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const normalizedFolders = useMemo(() => {
    const list = Array.isArray(folders) ? folders : []
    return list.some((folder) => folder.id === "root") ? list : [ROOT_FOLDER, ...list]
  }, [folders])
  const normalizedImages = useMemo(
    () => (Array.isArray(images) ? images : []).map((image) => ({ ...image, url: ensureHttps(image.url), folderId: image.folderId || "root" })),
    [images],
  )
  const ownFolder = normalizedFolders.find((folder) => folder.ownerId === myUserId)

  useEffect(() => {
    if (!normalizedFolders.some((folder) => folder.id === activeFolderId)) setActiveFolderId("root")
  }, [activeFolderId, normalizedFolders])

  const visibleImages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return normalizedImages.filter((image) =>
      (activeFolderId === "root" || image.folderId === activeFolderId) &&
      (!query || image.name.toLowerCase().includes(query)),
    )
  }, [activeFolderId, normalizedImages, searchQuery])

  const activeFolder = normalizedFolders.find((folder) => folder.id === activeFolderId) || ROOT_FOLDER
  const canManageImage = (image: SharedImage) => isGm || image.ownerId === myUserId
  const isPending = (imageId: string) => requests.some((request) => request.imageId === imageId && request.requesterId === myUserId)

  async function runAction(key: string, action: string, payload?: Record<string, unknown>) {
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
    const folderId = isGm ? activeFolderId : ownFolder?.id || "root"
    const image: SharedImage = { id: crypto.randomUUID(), name, url, isPublic: false, folderId, ownerId: myUserId, createdAt: Date.now() }
    if (isGm) updateForGm([...normalizedImages, image])
    else await runAction("add", "add", { image })
    setNewName("")
    setNewUrl("")
    if (!isGm && ownFolder) setActiveFolderId(ownFolder.id)
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
    if (!isGm || !name) return
    if (normalizedFolders.some((folder) => folder.name.trim().toLowerCase() === name.toLowerCase())) return setError("Já existe uma pasta com esse nome.")
    const folder = { id: crypto.randomUUID(), name }
    updateForGm(normalizedImages, [...normalizedFolders, folder])
    setActiveFolderId(folder.id)
    setNewFolderName("")
    setShowNewFolder(false)
  }

  function renameFolder(folder: GalleryFolder) {
    if (!isGm || folder.id === "root" || folder.isPlayerFolder) return
    const name = window.prompt("Novo nome da pasta:", folder.name)?.trim()
    if (!name) return
    if (normalizedFolders.some((entry) => entry.id !== folder.id && entry.name.toLowerCase() === name.toLowerCase())) return setError("Já existe uma pasta com esse nome.")
    updateForGm(normalizedImages, normalizedFolders.map((entry) => entry.id === folder.id ? { ...entry, name } : entry))
  }

  function deleteFolder(folder: GalleryFolder) {
    if (!isGm || folder.id === "root" || folder.isPlayerFolder) return
    if (!window.confirm(`Excluir a pasta "${folder.name}"? As imagens serão movidas para Todas as imagens.`)) return
    updateForGm(
      normalizedImages.map((image) => image.folderId === folder.id ? { ...image, folderId: "root" } : image),
      normalizedFolders.filter((entry) => entry.id !== folder.id),
    )
    setActiveFolderId("root")
  }

  function count(folderId: string) {
    return folderId === "root" ? normalizedImages.length : normalizedImages.filter((image) => image.folderId === folderId).length
  }

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
      {isGm && requests.length > 0 && <section className="mb-4 shrink-0 rounded-sm border border-amber-400/40 bg-amber-950/25 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300"><Send className="size-4" /> Solicitações de envio ({requests.length})</div>
        <div className="flex gap-2 overflow-x-auto pb-1">{requests.map((request) => <div key={request.id} className="flex min-w-64 items-center gap-3 rounded-sm border border-white/10 bg-black/30 p-2"><img src={request.imageUrl} alt="" className="size-12 rounded object-cover" /><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{request.imageName}</strong><span className="text-xs text-muted-foreground">{request.requesterName}</span></div><button disabled={!!busyKey} onClick={() => runAction(request.id, "resolve-broadcast", { requestId: request.id, resolution: "approved" })} className="rounded bg-green-500/15 p-2 text-green-400" title="Aprovar"><Check className="size-4" /></button><button disabled={!!busyKey} onClick={() => runAction(request.id, "resolve-broadcast", { requestId: request.id, resolution: "rejected" })} className="rounded bg-red-500/15 p-2 text-red-400" title="Recusar"><X className="size-4" /></button></div>)}</div>
      </section>}

      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-sm border border-primary/20 bg-black/20 md:flex">
          <div className="flex items-center justify-between border-b border-primary/15 p-3"><span className="text-xs font-black uppercase tracking-widest">Pastas</span>{isGm && <Button size="sm" variant="ghost" className="size-8 p-0" onClick={() => setShowNewFolder(true)}><FolderPlus className="size-4" /></Button>}</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar-sepia">{normalizedFolders.map((folder) => <div key={folder.id} className={`group mb-1 flex items-center rounded-sm ${activeFolderId === folder.id ? "bg-primary/15 text-primary" : "hover:bg-white/5"}`}><button onClick={() => setActiveFolderId(folder.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"><Folder className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{folder.id === "root" ? "Todas as imagens" : folder.isPlayerFolder ? `${folder.name} (jogador)` : folder.name}</span><span className="text-[10px] text-muted-foreground">{count(folder.id)}</span></button>{isGm && folder.id !== "root" && !folder.isPlayerFolder && <div className="mr-1 hidden gap-1 group-hover:flex"><button onClick={() => renameFolder(folder)}><Pencil className="size-3" /></button><button onClick={() => deleteFolder(folder)} className="text-red-400"><Trash2 className="size-3" /></button></div>}</div>)}</div>
          {isGm && showNewFolder && <div className="border-t border-primary/15 p-3"><input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createFolder()} placeholder="Nome da pasta..." className="mb-2 w-full rounded-sm border border-white/10 bg-black/40 p-2 text-xs outline-none" /><div className="flex gap-2"><Button size="sm" variant="magical" className="flex-1" onClick={createFolder}>Criar</Button><Button size="sm" variant="ghost" onClick={() => setShowNewFolder(false)}>Cancelar</Button></div></div>}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mb-3 flex shrink-0 items-center gap-2 overflow-x-auto pb-1 md:hidden">{normalizedFolders.map((folder) => <button key={folder.id} onClick={() => setActiveFolderId(folder.id)} className={`flex shrink-0 items-center gap-2 rounded-sm border px-3 py-2 text-xs font-bold ${activeFolderId === folder.id ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 bg-black/20"}`}><Folder className="size-3.5" />{folder.id === "root" ? "Todas" : folder.name}</button>)}{isGm && <button onClick={() => setShowNewFolder(true)} className="rounded-sm border border-primary/30 p-2"><FolderPlus className="size-4" /></button>}</div>
          <div className="mb-3 flex shrink-0 items-center gap-2 text-sm font-bold"><Folder className="size-5 text-primary" /><span className="truncate">{activeFolder.name}</span><ChevronRight className="size-4 text-muted-foreground" /><span className="text-xs font-normal text-muted-foreground">{visibleImages.length} imagem(ns)</span></div>

          {(isGm || ownFolder) && <div className="panel mb-4 flex shrink-0 flex-col gap-2 rounded-sm border border-primary/20 p-3 sm:flex-row">
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome da imagem" className="min-w-0 flex-1 rounded-sm border border-white/10 bg-black/40 p-2 text-sm outline-none" />
            <input value={newUrl.startsWith("data:image/") ? "Arquivo carregado" : newUrl} readOnly={newUrl.startsWith("data:image/")} onChange={(event) => setNewUrl(event.target.value)} placeholder="URL HTTPS ou escolha um arquivo" className="min-w-0 flex-1 rounded-sm border border-white/10 bg-black/40 p-2 text-sm outline-none" />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => selectFile(event.target.files?.[0])} />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} title="Escolher arquivo"><Upload className="size-4" /></Button>
            <Button type="button" variant="magical" disabled={busyKey === "add"} onClick={() => void addImage()}>{busyKey === "add" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}Adicionar</Button>
          </div>}

          <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 content-start gap-5 overflow-y-auto pb-10 pr-2 custom-scrollbar-sepia sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleImages.map((image) => <article key={image.id} className="rpg-gallery-card rpg-themed-card group overflow-hidden border border-white/10 bg-zinc-900 shadow-md">
              <button type="button" onClick={() => onShowImage(image)} className="relative block aspect-video w-full overflow-hidden bg-black/80"><img src={image.url} alt={image.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /><span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/60 group-hover:opacity-100">{isGm ? <Send className="size-7" /> : <Eye className="size-7" />}</span><span className={`absolute right-2 top-2 flex items-center gap-1 rounded bg-black/80 px-2 py-1 text-[9px] font-bold uppercase ${image.isPublic ? "text-green-400" : "text-zinc-400"}`}>{image.isPublic ? <Eye className="size-3" /> : <EyeOff className="size-3" />}{image.isPublic ? "Pública" : "Privada"}</span></button>
              <div className="flex items-center gap-2 border-t border-primary/15 bg-[#1b140f] p-3"><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-zinc-200">{image.name}</strong><span className="block truncate text-[9px] text-muted-foreground">{image.ownerName || (isGm ? "Mestre" : "")}</span></div>{canManageImage(image) && <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" className={`size-8 p-0 ${image.isPublic ? "text-green-400" : "text-muted-foreground"}`} onClick={() => isGm ? updateForGm(normalizedImages.map((entry) => entry.id === image.id ? { ...entry, isPublic: !entry.isPublic } : entry)) : runAction(`visibility:${image.id}`, "toggle-public", { imageId: image.id })} title={image.isPublic ? "Tornar privada" : "Tornar pública"}>{busyKey === `visibility:${image.id}` ? <Loader2 className="size-4 animate-spin" /> : image.isPublic ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</Button>
                {isGm && <select value={image.folderId || "root"} onChange={(event) => updateForGm(normalizedImages.map((entry) => entry.id === image.id ? { ...entry, folderId: event.target.value } : entry))} className="h-8 max-w-24 rounded-sm border border-white/10 bg-black/50 px-1 text-[10px]">{normalizedFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>}
                {!isGm && <Button size="sm" variant="ghost" className="size-8 p-0 text-primary" disabled={isPending(image.id) || !!busyKey} onClick={() => runAction(`send:${image.id}`, "request-broadcast", { imageId: image.id })} title={isPending(image.id) ? "Aguardando aprovação" : "Solicitar envio ao mestre"}>{busyKey === `send:${image.id}` ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>}
                <Button size="sm" variant="ghost" className="size-8 p-0 text-red-400" onClick={() => isGm ? updateForGm(normalizedImages.filter((entry) => entry.id !== image.id)) : runAction(`delete:${image.id}`, "delete", { imageId: image.id })}><Trash2 className="size-4" /></Button>
              </div>}</div>
              {!isGm && isPending(image.id) && <div className="border-t border-amber-400/20 bg-amber-950/25 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-amber-300">Aguardando aprovação do mestre</div>}
            </article>)}
            {visibleImages.length === 0 && <div className="col-span-full flex flex-col items-center py-16 text-muted-foreground"><Folder className="mb-3 size-8 opacity-20" /><span className="italic">Nenhuma imagem nesta pasta.</span></div>}
          </div>
        </main>
      </div>

      {isGm && showNewFolder && (
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
