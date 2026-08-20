"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload, Grid3X3, Settings } from "lucide-react"
import type { GameMap, GridConfig, TileData } from "@/lib/map-types"

export function MapImporter({ onMapReady }: { onMapReady: (map: GameMap) => void }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  
  // Removido offsetX e offsetY, conforme a nova tipagem GridConfig
  const [grid, setGrid] = useState<GridConfig>({ type: "square", tileSize: 70, rows: 0, cols: 0 })
  const [isProcessing, setIsProcessing] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // Passo 1: Upload com conversão para Base64 para sincronização universal
  // Passo 1: Upload com compressão garantida
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Comprime para evitar quebrar o Node.js limit (1MB/4MB JSON)
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const MAX_WIDTH = 1920; // Limita mapas gigantes

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Exporta como WebP (Muuito mais leve)
        setImageSrc(canvas.toDataURL("image/webp", 0.7));
      };
      img.src = event.target?.result as string;
    }
    reader.readAsDataURL(file)
  }

  // Passo 2 e 3: Processar imagem e "Tileizar"
  const handleProcessGrid = () => {
    if (!imgRef.current || !imageSrc) return
    setIsProcessing(true)

    const width = imgRef.current.naturalWidth
    const height = imgRef.current.naturalHeight
    
    // Calcula colunas e linhas baseado no tamanho do tile
    const cols = Math.floor(width / grid.tileSize)
    const rows = Math.floor(height / grid.tileSize)

    const tiles: Record<string, TileData> = {}

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        tiles[`${x},${y}`] = {
          x, 
          y,
          terrain: "grass",
          movementCost: 1,
          walkable: true
          // Removidos height, visible e occupied, conforme a nova tipagem TileData
        }
      }
    }

    setTimeout(() => {
      onMapReady({
        id: Math.random().toString(36).substring(2, 9),
        campaignId: "", // Será preenchido na CampaignRoom
        tokens: {},     // Inicializa a lista de tokens vazia
        name: "Novo Mapa de Batalha",
        imageUrl: imageSrc,
        grid: { ...grid, cols, rows },
        tiles
      })
      setIsProcessing(false)
    }, 800) // Fake delay para UX
  }

  return (
    <div className="rpg-modal flex w-full max-w-4xl flex-col gap-6 border border-primary/30 bg-zinc-950 p-6 shadow-2xl">
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <h3 className="font-serif text-2xl font-black flex items-center gap-2">
          <Upload className="size-6 text-primary" /> <span className="text-foreground">Importar Mapa</span>
        </h3>
      </div>

      {!imageSrc ? (
        <label className="rpg-empty flex h-64 w-full cursor-pointer flex-col items-center justify-center border-2 border-dashed border-border/50 transition-colors hover:border-primary/60 hover:bg-card/30">
          <Upload className="size-10 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground font-bold">Arraste uma imagem ou clique</p>
          <p className="text-xs text-muted-foreground mt-1">Recomendado imagens leves (JPG, WEBP) para não pesar o sincronismo.</p>
          <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </label>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Preview */}
          <div className="flex-1 border border-border/50 rounded-xl overflow-hidden relative bg-black/50">
            <img ref={imgRef} src={imageSrc} alt="Preview" className="w-full h-auto object-contain opacity-80" />
            {/* Grid Overlay Mock */}
            <div 
              className="absolute inset-0 pointer-events-none" 
              style={{
                backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)`,
                backgroundSize: `${grid.tileSize}px ${grid.tileSize}px`
              }} 
            />
          </div>

          {/* Configurações */}
          <div className="w-full lg:w-72 flex flex-col gap-4">
            <div className="p-4 bg-black/40 border border-white/10 rounded-lg">
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                <Settings className="size-3" /> Ajuste de Grade
              </h4>
              <label className="flex flex-col gap-1 mb-4">
                <span className="text-[10px] uppercase text-primary font-bold tracking-widest">Tamanho do Tile (px)</span>
                <input 
                  type="number" 
                  value={grid.tileSize} 
                  onChange={e => setGrid({...grid, tileSize: Number(e.target.value)})}
                  className="bg-black/60 border border-white/10 p-2 rounded text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </label>
              
              <Button onClick={handleProcessGrid} disabled={isProcessing} className="w-full gap-2 bg-primary text-primary-foreground font-bold hover:bg-primary/90">
                {isProcessing ? "Mapeando Coordenadas..." : <><Grid3X3 className="size-4" /> Gerar Matriz</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
