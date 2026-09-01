
"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Image as ImageIcon,
  Plus,
  Send,
  Trash2,
  X,
  Eye,
  EyeOff,
  Search,
  Folder,
  FolderPlus,
  Pencil,
  ChevronRight
} from "lucide-react"

import { Button } from "@/components/ui/button"

export interface SharedImage {
  id: string
  name: string
  url: string
  isPublic?: boolean
  folderId?: string
}

export interface GalleryFolder {
  id: string
  name: string
}

const ROOT_FOLDER: GalleryFolder = {
  id: "root",
  name: "Todas as imagens"
}

export function Imagepad({
  isGm,
  images,
  folders,
  onUpdateGallery,
  onShowImage,
  onClose
}: {
  isGm: boolean
  images: SharedImage[]
  folders: GalleryFolder[]
  onUpdateGallery: (
    images: SharedImage[],
    folders: GalleryFolder[]
  ) => void
  onShowImage: (url: string) => void
  onClose?: () => void
}) {
  const [newName, setNewName] = useState("")
  const [newUrl, setNewUrl] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  const [activeFolderId, setActiveFolderId] = useState("root")

  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")

  /*
   * Estado local.
   *
   * É importante não depender diretamente de `folders` e `images`
   * para as operações internas, pois o componente pai pode demorar
   * um render para devolver os dados atualizados.
   */
  const [localFolders, setLocalFolders] = useState<GalleryFolder[]>([
    ROOT_FOLDER
  ])

  const [localImages, setLocalImages] = useState<SharedImage[]>([])

  /*
   * Indica se já inicializamos os dados vindos do pai.
   */
  const [initialized, setInitialized] = useState(false)

  /*
   * Sincroniza as pastas vindas do componente pai.
   *
   * Não resetamos activeFolderId aqui.
   */
  useEffect(() => {
    const incomingFolders = Array.isArray(folders)
      ? folders
      : []

    const hasRoot = incomingFolders.some(
      folder => folder.id === "root"
    )

    const normalized = hasRoot
      ? incomingFolders
      : [ROOT_FOLDER, ...incomingFolders]

    /*
     * Se já temos uma pasta local que ainda não apareceu
     * nas props do pai, preservamos ela temporariamente.
     *
     * Isso evita que a pasta recém-criada desapareça
     * durante o ciclo de atualização do componente pai.
     */
    setLocalFolders(current => {
      if (!initialized) {
        return normalized
      }

      const incomingIds = new Set(
        normalized.map(folder => folder.id)
      )

      const localOnlyFolders = current.filter(
        folder =>
          folder.id !== "root" &&
          !incomingIds.has(folder.id)
      )

      if (localOnlyFolders.length === 0) {
        return normalized
      }

      return [
        ...normalized,
        ...localOnlyFolders
      ]
    })

    setInitialized(true)
  }, [folders, initialized])

  /*
   * Sincroniza as imagens.
   */
  useEffect(() => {
    const normalizedImages = (
      Array.isArray(images) ? images : []
    ).map(image => ({
      ...image,
      folderId: image.folderId || "root"
    }))

    setLocalImages(normalizedImages)
  }, [images])

  /*
   * Garante que a pasta atualmente selecionada ainda existe.
   *
   * Se ela foi removida, voltamos para root.
   */
  useEffect(() => {
    const exists = localFolders.some(
      folder => folder.id === activeFolderId
    )

    if (!exists) {
      setActiveFolderId("root")
    }
  }, [localFolders, activeFolderId])

  /*
   * Pastas normalizadas.
   */
  const normalizedFolders = useMemo(() => {
    const hasRoot = localFolders.some(
      folder => folder.id === "root"
    )

    if (hasRoot) {
      return localFolders
    }

    return [
      ROOT_FOLDER,
      ...localFolders
    ]
  }, [localFolders])

  /*
   * Imagens normalizadas.
   */
  const normalizedImages = useMemo(() => {
    return localImages.map(image => ({
      ...image,
      folderId: image.folderId || "root"
    }))
  }, [localImages])

  /*
   * Atualiza o estado local E comunica o componente pai.
   *
   * Todas as operações de galeria passam por essa função.
   */
  const updateGallery = (
    nextImages: SharedImage[],
    nextFolders: GalleryFolder[]
  ) => {
    const normalizedNextImages = nextImages.map(
      image => ({
        ...image,
        folderId: image.folderId || "root"
      })
    )

    const normalizedNextFolders =
      nextFolders.some(
        folder => folder.id === "root"
      )
        ? nextFolders
        : [
            ROOT_FOLDER,
            ...nextFolders
          ]

    /*
     * Atualização imediata da interface.
     */
    setLocalImages(normalizedNextImages)
    setLocalFolders(normalizedNextFolders)

    /*
     * Persistência no componente pai.
     */
    onUpdateGallery(
      normalizedNextImages,
      normalizedNextFolders
    )
  }

  /*
   * ADICIONAR IMAGEM
   */
  const addImage = () => {
    const name = newName.trim()
    const url = newUrl.trim()

    if (!name || !url) {
      return
    }

    /*
     * Confirma que a pasta selecionada ainda existe.
     */
    const targetFolderExists =
      activeFolderId === "root" ||
      normalizedFolders.some(
        folder => folder.id === activeFolderId
      )

    const targetFolderId =
      targetFolderExists
        ? activeFolderId
        : "root"

    const newImage: SharedImage = {
      id: crypto.randomUUID(),
      name,
      url,
      isPublic: false,
      folderId: targetFolderId
    }

    updateGallery(
      [
        ...normalizedImages,
        newImage
      ],
      normalizedFolders
    )

    setNewName("")
    setNewUrl("")
  }

  /*
   * REMOVER IMAGEM
   */
  const removeImage = (id: string) => {
    const updatedImages =
      normalizedImages.filter(
        image => image.id !== id
      )

    updateGallery(
      updatedImages,
      normalizedFolders
    )
  }

  /*
   * ALTERAR VISIBILIDADE
   */
  const toggleVisibility = (id: string) => {
    const updatedImages =
      normalizedImages.map(image =>
        image.id === id
          ? {
              ...image,
              isPublic: !image.isPublic
            }
          : image
      )

    updateGallery(
      updatedImages,
      normalizedFolders
    )
  }

  /*
   * MOVER IMAGEM
   */
  const moveImage = (
    imageId: string,
    folderId: string
  ) => {
    const folderExists =
      folderId === "root" ||
      normalizedFolders.some(
        folder => folder.id === folderId
      )

    if (!folderExists) {
      return
    }

    const updatedImages =
      normalizedImages.map(image =>
        image.id === imageId
          ? {
              ...image,
              folderId
            }
          : image
      )

    updateGallery(
      updatedImages,
      normalizedFolders
    )
  }

  /*
   * ABRIR FORMULÁRIO DE NOVA PASTA
   */
  const openNewFolder = () => {
    setNewFolderName("")
    setShowNewFolder(true)
  }

  /*
   * CANCELAR NOVA PASTA
   */
  const cancelNewFolder = () => {
    setNewFolderName("")
    setShowNewFolder(false)
  }

  /*
   * CRIAR PASTA
   */
  const createFolder = () => {
    const name = newFolderName.trim()

    if (!name) {
      return
    }

    /*
     * Evita criar duas pastas com o mesmo nome.
     */
    const alreadyExists =
      normalizedFolders.some(
        folder =>
          folder.id !== "root" &&
          folder.name.trim().toLowerCase() ===
            name.toLowerCase()
      )

    if (alreadyExists) {
      window.alert(
        "Já existe uma pasta com esse nome."
      )
      return
    }

    const newFolder: GalleryFolder = {
      id: crypto.randomUUID(),
      name
    }

    const updatedFolders = [
      ...normalizedFolders,
      newFolder
    ]

    /*
     * Atualiza primeiro a interface.
     */
    setLocalFolders(updatedFolders)

    /*
     * Entra na pasta criada.
     */
    setActiveFolderId(newFolder.id)

    /*
     * Persiste no componente pai.
     */
    onUpdateGallery(
      normalizedImages,
      updatedFolders
    )

    /*
     * Fecha o formulário.
     */
    setNewFolderName("")
    setShowNewFolder(false)
  }

  /*
   * RENOMEAR PASTA
   */
  const renameFolder = (
    folder: GalleryFolder
  ) => {
    if (folder.id === "root") {
      return
    }

    const name = window.prompt(
      "Digite o novo nome da pasta:",
      folder.name
    )

    if (!name?.trim()) {
      return
    }

    const trimmedName = name.trim()

    const alreadyExists =
      normalizedFolders.some(
        item =>
          item.id !== folder.id &&
          item.id !== "root" &&
          item.name.trim().toLowerCase() ===
            trimmedName.toLowerCase()
      )

    if (alreadyExists) {
      window.alert(
        "Já existe uma pasta com esse nome."
      )
      return
    }

    const updatedFolders =
      normalizedFolders.map(item =>
        item.id === folder.id
          ? {
              ...item,
              name: trimmedName
            }
          : item
      )

    updateGallery(
      normalizedImages,
      updatedFolders
    )
  }

  /*
   * EXCLUIR PASTA
   */
  const deleteFolder = (
    folder: GalleryFolder
  ) => {
    if (folder.id === "root") {
      return
    }

    const confirmed = window.confirm(
      `Excluir a pasta "${folder.name}"?\n\nAs imagens serão movidas para "Todas as imagens".`
    )

    if (!confirmed) {
      return
    }

    /*
     * Imagens da pasta excluída vão para root.
     */
    const updatedImages =
      normalizedImages.map(image =>
        image.folderId === folder.id
          ? {
              ...image,
              folderId: "root"
            }
          : image
      )

    /*
     * Remove a pasta.
     */
    const updatedFolders =
      normalizedFolders.filter(
        item => item.id !== folder.id
      )

    /*
     * Se estamos dentro da pasta excluída,
     * voltamos imediatamente para root.
     */
    if (activeFolderId === folder.id) {
      setActiveFolderId("root")
    }

    updateGallery(
      updatedImages,
      updatedFolders
    )
  }

  /*
   * TODAS AS IMAGENS DA GALERIA.
   */
  const totalVisibleImages =
    normalizedImages.filter(
      image => isGm || image.isPublic
    ).length

  /*
   * IMAGENS DA PASTA ATUAL.
   */
  const visibleImages = useMemo(() => {
    const query =
      searchQuery.trim().toLowerCase()

    return normalizedImages
      .filter(
        image =>
          isGm || image.isPublic
      )
      .filter(image => {
        /*
         * ROOT mostra todas as imagens.
         */
        if (activeFolderId === "root") {
          return true
        }

        /*
         * Pasta normal mostra somente
         * as imagens daquela pasta.
         */
        return (
          image.folderId ===
          activeFolderId
        )
      })
      .filter(image => {
        if (!query) {
          return true
        }

        return image.name
          .toLowerCase()
          .includes(query)
      })
  }, [
    normalizedImages,
    isGm,
    activeFolderId,
    searchQuery
  ])

  /*
   * PASTA ATUAL.
   */
  const activeFolder =
    normalizedFolders.find(
      folder =>
        folder.id === activeFolderId
    ) || ROOT_FOLDER

  /*
   * Contador de imagens de uma pasta.
   */
  const getFolderCount = (
    folderId: string
  ) => {
    if (folderId === "root") {
      return totalVisibleImages
    }

    return normalizedImages
      .filter(
        image =>
          image.folderId === folderId
      )
      .filter(
        image =>
          isGm || image.isPublic
      )
      .length
  }

  return (
    <div className="rpg-themed-workspace flex h-full min-h-0 flex-col overflow-hidden bg-[#15100c] p-4 text-foreground sm:p-6">

      {/* ========================================================= */}
      {/* HEADER                                                     */}
      {/* ========================================================= */}

      <div className="mb-5 flex shrink-0 items-start justify-between gap-4 border-b border-primary/25 pb-5">

        <div className="min-w-0 flex-1">

          <span className="rpg-kicker mb-2">
            Acervo visual
          </span>

          <h2 className="rpg-title flex items-center gap-2 text-2xl font-black">
            <ImageIcon className="size-6" />
            Galeria arcana
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {isGm
              ? "Organize suas imagens por pastas."
              : "Imagens e referências liberadas pelo Mestre."}
          </p>

          <div className="relative mt-4 max-w-md">

            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

            <input
              type="text"
              placeholder="Buscar imagem por nome..."
              value={searchQuery}
              onChange={event =>
                setSearchQuery(
                  event.target.value
                )
              }
              className="w-full rounded-sm border border-white/10 bg-black/40 py-2 pl-9 pr-4 text-sm text-foreground focus:border-primary focus:outline-none"
            />

          </div>

        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-sm border border-border/50 bg-black/20 p-2 hover:border-primary/60 hover:bg-primary/10"
            title="Fechar Galeria"
          >
            <X className="size-5 text-muted-foreground hover:text-white" />
          </button>
        )}

      </div>

      {/* ========================================================= */}
      {/* ÁREA PRINCIPAL                                             */}
      {/* ========================================================= */}

      <div className="flex min-h-0 flex-1 gap-4">

        {/* ======================================================= */}
        {/* SIDEBAR                                                  */}
        {/* ======================================================= */}

        <aside className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-sm border border-primary/20 bg-black/20 md:flex">

          {/* CABEÇALHO DAS PASTAS */}

          <div className="flex shrink-0 items-center justify-between border-b border-primary/15 p-3">

            <span className="text-xs font-black uppercase tracking-widest">
              Pastas
            </span>

            {isGm && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Nova pasta"
                onClick={openNewFolder}
              >
                <FolderPlus className="size-4" />
              </Button>
            )}

          </div>

          {/* LISTA DE PASTAS */}

          <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar-sepia">

            {/* ROOT */}

            <button
              type="button"
              onClick={() =>
                setActiveFolderId("root")
              }
              className={`mb-1 flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors ${
                activeFolderId === "root"
                  ? "bg-primary/15 text-primary"
                  : "hover:bg-white/5"
              }`}
            >

              <Folder className="size-4 shrink-0" />

              <span className="min-w-0 flex-1 truncate">
                Todas as imagens
              </span>

              <span className="text-[10px] text-muted-foreground">
                {getFolderCount("root")}
              </span>

            </button>

            {/* PASTAS CRIADAS */}

            {normalizedFolders
              .filter(
                folder =>
                  folder.id !== "root"
              )
              .map(folder => {

                const selected =
                  activeFolderId ===
                  folder.id

                return (
                  <div
                    key={folder.id}
                    className={`group mb-1 flex w-full items-center rounded-sm transition-colors ${
                      selected
                        ? "bg-primary/15 text-primary"
                        : "hover:bg-white/5"
                    }`}
                  >

                    {/* BOTÃO DA PASTA */}

                    <button
                      type="button"
                      onClick={() =>
                        setActiveFolderId(
                          folder.id
                        )
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
                      title={`Abrir pasta ${folder.name}`}
                    >

                      <Folder className="size-4 shrink-0" />

                      <span className="min-w-0 flex-1 truncate">
                        {folder.name}
                      </span>

                      <span className="text-[10px] text-muted-foreground">
                        {getFolderCount(
                          folder.id
                        )}
                      </span>

                    </button>

                    {/* AÇÕES */}

                    {isGm && (
                      <div className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">

                        {/* RENOMEAR */}

                        <button
                          type="button"
                          className="rounded p-1 hover:bg-white/10"
                          title="Renomear pasta"
                          onClick={event => {
                            event.stopPropagation()
                            renameFolder(
                              folder
                            )
                          }}
                        >
                          <Pencil className="size-3" />
                        </button>

                        {/* EXCLUIR */}

                        <button
                          type="button"
                          className="rounded p-1 text-red-400 hover:bg-red-400/10"
                          title="Excluir pasta"
                          onClick={event => {
                            event.stopPropagation()
                            deleteFolder(
                              folder
                            )
                          }}
                        >
                          <Trash2 className="size-3" />
                        </button>

                      </div>
                    )}

                  </div>
                )
              })}

            {/* EMPTY STATE DE PASTAS */}

            {normalizedFolders.filter(
              folder =>
                folder.id !== "root"
            ).length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {isGm
                  ? "Nenhuma pasta criada."
                  : "Nenhuma pasta disponível."}
              </div>
            )}

          </div>

          {/* FORMULÁRIO NOVA PASTA */}

          {isGm && showNewFolder && (
            <div className="shrink-0 border-t border-primary/15 bg-black/20 p-3">

              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Nova pasta
              </div>

              <input
                autoFocus
                type="text"
                placeholder="Nome da pasta..."
                value={newFolderName}
                onChange={event =>
                  setNewFolderName(
                    event.target.value
                  )
                }
                onKeyDown={event => {

                  if (
                    event.key ===
                    "Enter"
                  ) {
                    event.preventDefault()
                    createFolder()
                  }

                  if (
                    event.key ===
                    "Escape"
                  ) {
                    event.preventDefault()
                    cancelNewFolder()
                  }

                }}
                className="mb-2 w-full rounded-sm border border-white/10 bg-black/40 p-2 text-xs text-foreground focus:border-primary focus:outline-none"
              />

              <div className="flex gap-2">

                <Button
                  type="button"
                  size="sm"
                  variant="magical"
                  className="flex-1 text-xs"
                  onClick={createFolder}
                >
                  Criar
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={cancelNewFolder}
                >
                  Cancelar
                </Button>

              </div>

            </div>
          )}

        </aside>

        {/* ======================================================= */}
        {/* CONTEÚDO                                                 */}
        {/* ======================================================= */}

        <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">

          {/* TÍTULO / NAVEGAÇÃO */}

          <div className="mb-4 flex shrink-0 items-center justify-between gap-3">

            <div className="flex min-w-0 items-center gap-2">

              <Folder className="size-5 shrink-0 text-primary" />

              <span
                className="truncate text-sm font-bold"
                title={activeFolder.name}
              >
                {activeFolder.name}
              </span>

              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />

              <span className="shrink-0 text-xs text-muted-foreground">
                {visibleImages.length} imagem(ns)
              </span>

            </div>

            {/* BOTÃO MOBILE */}

            {isGm && (
              <Button
                type="button"
                variant="magical"
                onClick={openNewFolder}
                className="shrink-0 font-bold md:hidden"
              >
                <FolderPlus className="mr-2 size-4" />
                Pasta
              </Button>
            )}

          </div>

          {/* NAVEGAÇÃO MOBILE DE PASTAS */}

          <div className="mb-4 flex shrink-0 gap-2 overflow-x-auto pb-1 md:hidden">

            <button
              type="button"
              onClick={() =>
                setActiveFolderId("root")
              }
              className={`flex shrink-0 items-center gap-2 rounded-sm border px-3 py-2 text-xs font-bold ${
                activeFolderId === "root"
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-white/10 bg-black/20 text-muted-foreground"
              }`}
            >
              <Folder className="size-3.5" />
              Todas
            </button>

            {normalizedFolders
              .filter(
                folder =>
                  folder.id !== "root"
              )
              .map(folder => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() =>
                    setActiveFolderId(
                      folder.id
                    )
                  }
                  className={`flex max-w-40 shrink-0 items-center gap-2 rounded-sm border px-3 py-2 text-xs font-bold ${
                    activeFolderId ===
                    folder.id
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-white/10 bg-black/20 text-muted-foreground"
                  }`}
                  title={folder.name}
                >
                  <Folder className="size-3.5 shrink-0" />

                  <span className="truncate">
                    {folder.name}
                  </span>
                </button>
              ))}

          </div>

          {/* ===================================================== */}
          {/* ADIÇÃO DE IMAGEM                                       */}
          {/* ===================================================== */}

          {isGm && (
            <div className="panel mb-5 flex shrink-0 flex-col gap-3 rounded-sm border border-primary/20 p-4 sm:flex-row">

              <input
                type="text"
                placeholder="Nome da imagem"
                value={newName}
                onChange={event =>
                  setNewName(
                    event.target.value
                  )
                }
                onKeyDown={event => {
                  if (
                    event.key ===
                    "Enter"
                  ) {
                    event.preventDefault()
                    addImage()
                  }
                }}
                className="flex-1 rounded-sm border border-white/10 bg-black/40 p-2 text-sm focus:border-primary focus:outline-none"
              />

              <input
                type="text"
                placeholder="URL da imagem (https://...)"
                value={newUrl}
                onChange={event =>
                  setNewUrl(
                    event.target.value
                  )
                }
                onKeyDown={event => {
                  if (
                    event.key ===
                    "Enter"
                  ) {
                    event.preventDefault()
                    addImage()
                  }
                }}
                className="flex-1 rounded-sm border border-white/10 bg-black/40 p-2 text-sm focus:border-primary focus:outline-none"
              />

              <Button
                type="button"
                variant="magical"
                onClick={addImage}
                className="font-bold"
              >
                <Plus className="mr-2 size-4" />
                Adicionar
              </Button>

            </div>
          )}

          {/* ===================================================== */}
          {/* GRID DE IMAGENS                                        */}
          {/* ===================================================== */}

          <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 content-start gap-5 overflow-y-auto pb-10 pr-2 custom-scrollbar-sepia sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

            {visibleImages.map(img => (

              <div
                key={img.id}
                className="rpg-gallery-card rpg-themed-card group relative flex flex-col overflow-hidden border border-white/10 bg-zinc-900 shadow-md transition-all duration-300 hover:shadow-xl"
              >

                {/* IMAGEM */}

                <div
                  className="relative aspect-video shrink-0 cursor-pointer overflow-hidden bg-black/80"
                  onClick={() =>
                    onShowImage(
                      img.url
                    )
                  }
                >

                  <img
                    src={img.url}
                    alt={img.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />

                  <div
                    className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:bg-black/60 group-hover:opacity-100"
                    title={
                      isGm
                        ? "Transmitir para Todos"
                        : "Visualizar Imagem"
                    }
                  >
                    {isGm ? (
                      <Send className="size-7 text-white" />
                    ) : (
                      <Eye className="size-8 text-white" />
                    )}
                  </div>

                  {/* STATUS */}

                  {isGm && (
                    <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md border border-white/10 bg-black/80 px-2 py-1">

                      {img.isPublic ? (
                        <>
                          <Eye className="size-3 text-green-400" />

                          <span className="text-[9px] font-bold uppercase text-green-400">
                            Pública
                          </span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="size-3 text-muted-foreground" />

                          <span className="text-[9px] font-bold uppercase text-muted-foreground">
                            Privada
                          </span>
                        </>
                      )}

                    </div>
                  )}

                </div>

                {/* RODAPÉ */}

                <div className="relative z-20 flex w-full shrink-0 items-center justify-between gap-2 border-t border-primary/15 bg-[#1b140f] p-3">

                  <div className="min-w-0 flex-1">

                    <span
                      className="block truncate text-sm font-bold text-zinc-200"
                      title={img.name}
                    >
                      {img.name}
                    </span>

                    {isGm && (
                      <span className="block truncate text-[9px] text-muted-foreground">

                        {normalizedFolders.find(
                          folder =>
                            folder.id ===
                            (img.folderId ||
                              "root")
                        )?.name ||
                          "Todas as imagens"}

                      </span>
                    )}

                  </div>

                  {isGm && (
                    <div className="flex shrink-0 items-center gap-1">

                      {/* VISIBILIDADE */}

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={`h-8 w-8 p-0 ${
                          img.isPublic
                            ? "text-green-400 hover:bg-green-400/20"
                            : "text-muted-foreground hover:bg-white/10"
                        }`}
                        onClick={event => {
                          event.stopPropagation()
                          toggleVisibility(
                            img.id
                          )
                        }}
                        title={
                          img.isPublic
                            ? "Ocultar dos jogadores"
                            : "Mostrar aos jogadores"
                        }
                      >
                        {img.isPublic ? (
                          <Eye className="size-4" />
                        ) : (
                          <EyeOff className="size-4" />
                        )}
                      </Button>

                      {/* MOVER */}

                      <select
                        value={
                          img.folderId ||
                          "root"
                        }
                        onChange={event =>
                          moveImage(
                            img.id,
                            event.target
                              .value
                          )
                        }
                        onClick={event =>
                          event.stopPropagation()
                        }
                        className="h-8 max-w-28 rounded-sm border border-white/10 bg-black/50 px-1 text-[10px] text-zinc-300 outline-none"
                        title="Mover para pasta"
                      >

                        {normalizedFolders.map(
                          folder => (
                            <option
                              key={
                                folder.id
                              }
                              value={
                                folder.id
                              }
                            >
                              {folder.name}
                            </option>
                          )
                        )}

                      </select>

                      {/* EXCLUIR */}

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-red-400 hover:bg-red-400/20 hover:text-red-300"
                        onClick={event => {
                          event.stopPropagation()
                          removeImage(
                            img.id
                          )
                        }}
                        title="Excluir imagem"
                      >
                        <Trash2 className="size-4" />
                      </Button>

                    </div>
                  )}

                </div>

              </div>

            ))}

            {/* EMPTY STATE */}

            {visibleImages.length === 0 && (
              <div className="rpg-empty col-span-full flex flex-col items-center justify-center border border-dashed border-border/40 bg-black/20 py-16 text-muted-foreground">

                <Folder className="mb-3 size-8 opacity-20" />

                <span className="italic">
                  {searchQuery
                    ? "Nenhuma imagem corresponde à sua busca."
                    : isGm
                      ? "Nenhuma imagem nesta pasta."
                      : "Nenhuma imagem foi liberada pelo Mestre nesta pasta."}
                </span>

              </div>
            )}

          </div>

        </div>

      </div>

      {/* ========================================================= */}
      {/* MODAL MOBILE / NOVA PASTA                                 */}
      {/* ========================================================= */}

      {isGm && showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:hidden">

          <div className="w-full max-w-sm rounded-sm border border-primary/30 bg-[#15100c] p-4 shadow-2xl">

            <div className="mb-3 flex items-center justify-between">

              <div className="flex items-center gap-2">

                <FolderPlus className="size-5 text-primary" />

                <span className="font-bold">
                  Nova pasta
                </span>

              </div>

              <button
                type="button"
                onClick={cancelNewFolder}
                className="rounded p-1 hover:bg-white/10"
              >
                <X className="size-4" />
              </button>

            </div>

            <input
              autoFocus
              type="text"
              placeholder="Nome da pasta..."
              value={newFolderName}
              onChange={event =>
                setNewFolderName(
                  event.target.value
                )
              }
              onKeyDown={event => {

                if (
                  event.key ===
                  "Enter"
                ) {
                  event.preventDefault()
                  createFolder()
                }

                if (
                  event.key ===
                  "Escape"
                ) {
                  event.preventDefault()
                  cancelNewFolder()
                }

              }}
              className="mb-3 w-full rounded-sm border border-white/10 bg-black/40 p-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />

            <div className="flex gap-2">

              <Button
                type="button"
                variant="magical"
                className="flex-1"
                onClick={createFolder}
              >
                Criar
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={cancelNewFolder}
              >
                Cancelar
              </Button>

            </div>

          </div>

        </div>
      )}

    </div>
  )
}
