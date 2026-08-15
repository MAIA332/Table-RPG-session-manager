"use client"

import { useState, useEffect } from "react"
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
  const [searchQuery, setSearchQuery] = useState("") // Estado da barra de busca

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

  // Filtra por permissão (GM vê tudo, Jogador vê públicas) e depois pela barra de busca
  const visibleImages = (isGm ? images : images.filter(img => img.isPublic))
    .filter(img => img.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-zinc-950 p-6 text-foreground overflow-hidden">
      
      {/* Cabeçalho */}
      <div className="flex justify-between items-start mb-6 shrink-0 gap-4">
        <div className="flex-1">
          <h2 className="text-2xl font-black text-blue-400 font-serif flex items-center gap-2">
            <ImageIcon className="size-6" /> Galeria Arcana
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isGm
              ? "Catálogo de imagens, mapas soltos e referências visuais."
              : "Imagens e referências liberadas pelo Mestre."}
          </p>

          {/* Barra de Busca */}
          <div className="mt-5 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Buscar imagem por nome..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-foreground focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors shrink-0"
            title="Fechar Galeria"
          >
            <X className="size-5 text-muted-foreground hover:text-white" />
          </button>
        )}
      </div>

      {/* Painel de Adição (Apenas Mestre) */}
      {isGm && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6 bg-blue-500/5 p-4 rounded-xl border border-blue-500/20 shrink-0">
          <input type="text" placeholder="Nome da Imagem (Ex: Castelo de Gelo)" value={newName} onChange={e => setNewName(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-md p-2 text-sm focus:outline-none focus:border-blue-500" />
          <input type="text" placeholder="URL da Imagem (https://...)" value={newUrl} onChange={e => setNewUrl(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-md p-2 text-sm focus:outline-none focus:border-blue-500" />
          <Button onClick={addImage} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
            <Plus className="size-4 mr-2" /> Adicionar
          </Button>
        </div>
      )}

      {/* Grid de Imagens */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 overflow-y-auto custom-scrollbar-sepia pr-2 pb-10 flex-1 content-start">
        {visibleImages.map(img => (
          /* "h-fit" aqui impede que o card estique verticalmente e crie aquele espaço vazio enorme */
          <div key={img.id} className="relative group h-fit flex flex-col border border-white/10 rounded-xl overflow-hidden bg-zinc-900 shadow-md hover:shadow-xl hover:border-blue-500/50 transition-all duration-300">
            
            {/* Contêiner da Imagem */}
            <div className="aspect-video relative overflow-hidden bg-black/80 cursor-pointer" onClick={() => onShowImage(img.url)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />

              {/* Overlay interativo com efeito de Fade e Slide */}
              <div
                className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100 backdrop-blur-sm"
                title={isGm ? "Transmitir para Todos" : "Visualizar Imagem"}
              >
                <div className="flex flex-col items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                  {isGm ? (
                    <Send className="size-8 text-white drop-shadow-lg" />
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
            <div className="p-3 bg-zinc-900 border-t border-white/5 flex justify-between items-center shrink-0">
              <span className="font-bold text-sm truncate pr-2 text-zinc-200" title={img.name}>{img.name}</span>
              <div className="flex gap-1 shrink-0 relative z-20">
                {isGm && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`h-8 w-8 p-0 ${img.isPublic ? 'text-green-400 hover:bg-green-400/20' : 'text-muted-foreground hover:bg-white/10'}`}
                      onClick={() => toggleVisibility(img.id)}
                      title={img.isPublic ? "Ocultar dos Jogadores" : "Mostrar aos Jogadores"}
                    >
                      {img.isPublic ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/20 transition-colors" onClick={() => removeImage(img.id)} title="Excluir Imagem">
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Mensagem de Vazio */}
        {visibleImages.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground italic border border-dashed border-border/40 rounded-xl bg-black/20">
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