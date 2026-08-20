"use client"

import { useState } from "react"
import { Image as ImageIcon, Plus, Send, Trash2, X, Eye, EyeOff, Search } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface SharedImage {
  id: string;
  name: string;
  url: string;
  isPublic?: boolean; 
}

export function Imagepad({
  isGm,
  images,
  onUpdateImages,
  onShowImage,
  onClose
}: {
  isGm: boolean,
  images: SharedImage[],
  onUpdateImages: (images: SharedImage[]) => void,
  onShowImage: (url: string) => void,
  onClose?: () => void
}) {
  const [newName, setNewName] = useState("")
  const [newUrl, setNewUrl] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  const addImage = () => {
    if (!newName || !newUrl) return;
    const newImg: SharedImage = {
      id: Math.random().toString(36).substring(7),
      name: newName,
      url: newUrl,
      isPublic: false
    }
    onUpdateImages([...images, newImg])
    setNewName(""); setNewUrl("");
  }

  const removeImage = (id: string) => {
    onUpdateImages(images.filter(i => i.id !== id))
  }

  const toggleVisibility = (id: string) => {
    onUpdateImages(images.map(i => i.id === id ? { ...i, isPublic: !i.isPublic } : i))
  }

  const visibleImages = (isGm ? images : images.filter(img => img.isPublic))
    .filter(img => img.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#15100c] p-4 text-foreground sm:p-6">
      
      {/* Cabeçalho */}
      <div className="mb-6 flex shrink-0 items-start justify-between gap-4 border-b border-primary/25 pb-5">
        <div className="flex-1">
          <span className="rpg-kicker mb-2">Acervo visual</span>
          <h2 className="rpg-title flex items-center gap-2 text-2xl font-black">
            <ImageIcon className="size-6" /> Galeria arcana
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isGm
              ? "Catálogo de imagens, mapas soltos e referências visuais."
              : "Imagens e referências liberadas pelo Mestre."}
          </p>

          {/* Barra de Busca */}
          <div className="relative mt-5 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Buscar imagem por nome..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-sm border border-white/10 bg-black/40 py-2 pl-9 pr-4 text-sm text-foreground transition-colors focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 rounded-sm border border-border/50 bg-black/20 p-2 transition-colors hover:border-primary/60 hover:bg-primary/10"
            title="Fechar Galeria"
          >
            <X className="size-5 text-muted-foreground hover:text-white" />
          </button>
        )}
      </div>

      {/* Painel de Adição (Apenas Mestre) */}
      {isGm && (
        <div className="panel mb-6 flex shrink-0 flex-col gap-3 rounded-sm border border-primary/20 p-4 sm:flex-row">
          <input type="text" placeholder="Nome da Imagem (Ex: Castelo de Gelo)" value={newName} onChange={e => setNewName(e.target.value)} className="flex-1 rounded-sm border border-white/10 bg-black/40 p-2 text-sm focus:border-primary focus:outline-none" />
          <input type="text" placeholder="URL da Imagem (https://...)" value={newUrl} onChange={e => setNewUrl(e.target.value)} className="flex-1 rounded-sm border border-white/10 bg-black/40 p-2 text-sm focus:border-primary focus:outline-none" />
          <Button variant="magical" onClick={addImage} className="font-bold">
            <Plus className="size-4 mr-2" /> Adicionar
          </Button>
        </div>
      )}

      {/* Grid de Imagens */}
      <div className="grid flex-1 auto-rows-max grid-cols-1 content-start gap-5 overflow-y-auto pb-10 pr-2 custom-scrollbar-sepia sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {visibleImages.map(img => (
          <div key={img.id} className="rpg-gallery-card group relative flex flex-col overflow-hidden border border-white/10 bg-zinc-900 shadow-md transition-all duration-300 hover:shadow-xl">
            
            {/* Contêiner da Imagem */}
            <div className="aspect-video relative overflow-hidden bg-black/80 cursor-pointer shrink-0" onClick={() => onShowImage(img.url)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />

              {/* Overlay interativo com efeito de Fade e Slide */}
              <div
                className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100 backdrop-blur-sm"
                title={isGm ? "Transmitir para Todos" : "Visualizar Imagem"}
              >
                <div className="flex flex-col items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                  {isGm ? (
                    <Send className="size-7 text-white drop-shadow-lg" />
                  ) : (
                    <Eye className="size-8 text-white drop-shadow-lg" />
                  )}
                  <span className="text-[10px] font-bold text-white tracking-widest uppercase drop-shadow-md">
                    {isGm ? "Transmitir" : "Visualizar"}
                  </span>
                </div>
              </div>

              {/* Tag de Feedback Visual pro Mestre */}
              {isGm && (
                <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-md rounded-md px-2 py-1 border border-white/10 shadow-lg pointer-events-none flex items-center gap-1.5 z-10">
                  {img.isPublic ? (
                    <><Eye className="size-3 text-green-400" /><span className="text-[9px] font-bold text-green-400 uppercase tracking-wider">Pública</span></>
                  ) : (
                    <><EyeOff className="size-3 text-muted-foreground" /><span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Privada</span></>
                  )}
                </div>
              )}
            </div>

            {/* Rodapé do Card */}
            <div className="relative z-20 flex w-full shrink-0 items-center justify-between gap-2 border-t border-primary/15 bg-[#1b140f] p-3">
              <span className="min-w-0 flex-1 font-bold text-sm truncate text-zinc-200" title={img.name}>{img.name}</span>
              {isGm && (
                <div className="relative z-30 flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={`h-8 w-8 p-0 shrink-0 ${img.isPublic ? 'text-green-400 hover:bg-green-400/20' : 'text-muted-foreground hover:bg-white/10'}`}
                    onClick={(event) => { event.stopPropagation(); toggleVisibility(img.id); }}
                    title={img.isPublic ? "Ocultar dos Jogadores" : "Mostrar aos Jogadores"}
                  >
                    {img.isPublic ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 shrink-0 text-red-400 hover:text-red-300 hover:bg-red-400/20 transition-colors"
                    onClick={(event) => { event.stopPropagation(); removeImage(img.id); }}
                    title="Excluir Imagem"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Mensagem de Vazio */}
        {visibleImages.length === 0 && (
          <div className="rpg-empty col-span-full flex flex-col items-center justify-center border border-dashed border-border/40 bg-black/20 py-16 text-muted-foreground italic">
            <ImageIcon className="size-8 mb-3 opacity-20" />
            {isGm 
              ? (searchQuery ? "Nenhuma imagem corresponde à sua busca." : "Nenhuma imagem no catálogo.") 
              : "Nenhuma imagem foi liberada pelo Mestre ainda."}
          </div>
        )}
      </div>
    </div>
  )
}
