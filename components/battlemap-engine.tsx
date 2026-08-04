"use client"

import { useEffect, useRef, useState } from "react"
import { GameMap, TerrainType, TileData } from "@/lib/map-types"
import { Button } from "./ui/button"
import { Brush, Crosshair, Move, UserPlus, X } from "lucide-react"
import type { Character, ActiveCreature } from "@/lib/types"
import { AnimatePresence } from "framer-motion"

const TERRAIN_COLORS: Record<TerrainType, string> = {
  grass: "rgba(34, 197, 94, 0.2)", stone: "rgba(100, 116, 139, 0.4)",
  water: "rgba(59, 130, 246, 0.4)", lava: "rgba(239, 68, 68, 0.5)",
  mud: "rgba(161, 98, 7, 0.4)", wood: "rgba(180, 83, 9, 0.3)", snow: "rgba(255, 255, 255, 0.4)",
}

const TERRAIN_COSTS: Record<TerrainType, number> = {
  grass: 1, wood: 1, snow: 1, stone: 1, mud: 2, water: 3, lava: 999 
}

interface BattlemapProps {
  mapData: GameMap;
  characters: Character[];
  creatures: ActiveCreature[];
  isGm: boolean;
  onClose: () => void;
  onMoveToken: (mapId: string, tokenId: string, x: number, y: number, type: "character"| "creature") => void;
  onPaintTerrain: (mapId: string, tile: TileData) => void;
}

export function BattlemapEngine({ mapData, characters, creatures, isGm, onClose, onMoveToken, onPaintTerrain }: BattlemapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageCache = useRef<Record<string, HTMLImageElement>>({})
  
  const [mode, setMode] = useState<"view" | "paint" | "move" | "place">("view")
  const [activeTerrain, setActiveTerrain] = useState<TerrainType>("stone")
  
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })

  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [tokenToPlace, setTokenToPlace] = useState<{id: string, type: "character"|"creature"} | null>(null)
  const [hoveredTile, setHoveredTile] = useState<{x: number, y: number} | null>(null)
  const [renderTick, setRenderTick] = useState(0)

  const characterMovement = 6; 

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    canvas.width = canvas.parentElement!.clientWidth
    canvas.height = canvas.parentElement!.clientHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Renderiza Fundo
    if (!imageCache.current["bg"]) {
      const bg = new Image(); 
      bg.src = mapData.imageUrl;
      bg.onload = () => setRenderTick(t => t + 1);
      bg.onerror = () => setRenderTick(t => t + 1); // Evita travamento se o fundo falhar
      imageCache.current["bg"] = bg;
    }
    // Verifica se completou e tem largura real (não está quebrado)
    if (imageCache.current["bg"].complete && imageCache.current["bg"].naturalWidth > 0) {
      ctx.drawImage(imageCache.current["bg"], offset.x, offset.y)
    }

    // Pathfinding
    const reachable = new Set<string>()
    const activeTokenPos = selectedTokenId ? mapData.tokens?.[selectedTokenId] : null

    if (mode === "move" && activeTokenPos) {
      const queue = [{ x: activeTokenPos.x, y: activeTokenPos.y, cost: 0 }]
      const visited = new Map<string, number>()
      visited.set(`${activeTokenPos.x},${activeTokenPos.y}`, 0)

      while (queue.length > 0) {
        const current = queue.shift()!
        reachable.add(`${current.x},${current.y}`)

        const neighbors = [
          {x: current.x + 1, y: current.y}, {x: current.x - 1, y: current.y},
          {x: current.x, y: current.y + 1}, {x: current.x, y: current.y - 1}
        ]

        for (const n of neighbors) {
          const t = mapData.tiles[`${n.x},${n.y}`]
          if (t && t.walkable) {
            const newCost = current.cost + t.movementCost
            if (newCost <= characterMovement) {
              const key = `${n.x},${n.y}`
              if (!visited.has(key) || visited.get(key)! > newCost) {
                visited.set(key, newCost); queue.push({ x: n.x, y: n.y, cost: newCost })
              }
            }
          }
        }
      }
    }

    // Grid e Terreno
    const { tileSize, cols, rows } = mapData.grid
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const key = `${x},${y}`
        const tile = mapData.tiles[key]
        const px = offset.x + (x * tileSize)
        const py = offset.y + (y * tileSize)

        if (px + tileSize < 0 || px > canvas.width || py + tileSize < 0 || py > canvas.height) continue

        if (tile && tile.terrain !== "grass") {
          ctx.fillStyle = TERRAIN_COLORS[tile.terrain]
          ctx.fillRect(px, py, tileSize, tileSize)
        }

        if (mode === "move" && reachable.has(key)) {
          ctx.fillStyle = "rgba(59, 130, 246, 0.3)"
          ctx.fillRect(px, py, tileSize, tileSize)
        }

        ctx.strokeStyle = "rgba(255,255,255,0.15)"
        ctx.strokeRect(px, py, tileSize, tileSize)
      }
    }

    if (hoveredTile && mode === "move" && reachable.has(`${hoveredTile.x},${hoveredTile.y}`)) {
        ctx.fillStyle = "rgba(250, 204, 21, 0.5)"
        ctx.fillRect(offset.x + (hoveredTile.x * tileSize), offset.y + (hoveredTile.y * tileSize), tileSize, tileSize)
    }

    // Tokens
    Object.entries(mapData.tokens || {}).forEach(([id, pos]) => {
        const entity = pos.type === "character" ? characters.find(c => c.id === id) : creatures.find(c => c.instanceId === id);
        if (!entity) return;

        const url = pos.type === "character" ? (entity as Character).avatarUrl : (entity as ActiveCreature).imageUrl;
        const px = offset.x + (pos.x * tileSize) + tileSize/2;
        const py = offset.y + (pos.y * tileSize) + tileSize/2;
        const radius = tileSize/2 - 4;

        ctx.save()
        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.closePath()
        ctx.clip()

        if (url) {
           if (!imageCache.current[url]) {
               const img = new Image(); 
               img.src = url; 
               img.onload = () => setRenderTick(t => t + 1); // Força render avatar
               img.onerror = () => setRenderTick(t => t + 1); // Trata imagens quebradas 404
               imageCache.current[url] = img;
           }
           // Nova verificação para garantir que a imagem não está "quebrada"
           if (imageCache.current[url].complete && imageCache.current[url].naturalWidth > 0) {
               ctx.drawImage(imageCache.current[url], px - radius, py - radius, radius*2, radius*2)
           } else {
               ctx.fillStyle = pos.type === "character" ? "#3b82f6" : "#ef4444"; ctx.fill()
           }
        } else {
            ctx.fillStyle = pos.type === "character" ? "#3b82f6" : "#ef4444"; ctx.fill()
        }
        ctx.restore()

        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.strokeStyle = pos.type === "character" ? (selectedTokenId === id ? "#3b82f6" : "white") : (selectedTokenId === id ? "#ef4444" : "red")
        ctx.lineWidth = selectedTokenId === id ? 4 : 2
        ctx.stroke()
    })

  }, [mapData, offset, mode, selectedTokenId, hoveredTile, characters, creatures, renderTick])

  const getMousePos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const getTileFromMouse = (x: number, y: number) => {
    const tx = Math.floor((x - offset.x) / mapData.grid.tileSize)
    const ty = Math.floor((y - offset.y) / mapData.grid.tileSize)
    if (tx >= 0 && tx < mapData.grid.cols && ty >= 0 && ty < mapData.grid.rows) return {x: tx, y: ty}
    return null
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getMousePos(e)
    
    if (e.button === 1 || e.button === 2) {
      setIsDragging(true); setLastMousePos({ x, y }); return
    }

    const t = getTileFromMouse(x, y)
    if (!t) return

    if (mode === "paint" && isGm) {
      handlePaintTile(t.x, t.y); setIsDragging(true)
    } 
    else if (mode === "place" && tokenToPlace) {
      onMoveToken(mapData.id, tokenToPlace.id, t.x, t.y, tokenToPlace.type)
      setTokenToPlace(null)
      setMode("move") // Troca automaticamente
    }
    else if (mode === "move") {
      const clickedTokenId = Object.entries(mapData.tokens || {}).find(([_, pos]) => pos.x === t.x && pos.y === t.y)?.[0]
      
      if (clickedTokenId) {
        setSelectedTokenId(clickedTokenId)
      } else if (selectedTokenId) {
        const type = mapData.tokens[selectedTokenId].type;
        onMoveToken(mapData.id, selectedTokenId, t.x, t.y, type)
        setSelectedTokenId(null)
      }
    }
  }

  const handlePaintTile = (x: number, y: number) => {
    const key = `${x},${y}`
    const currentTile = mapData.tiles[key] || { x, y, terrain: "grass", walkable: true, movementCost: 1 };
    const updatedTile = { ...currentTile, terrain: activeTerrain, movementCost: TERRAIN_COSTS[activeTerrain], walkable: TERRAIN_COSTS[activeTerrain] < 999 }
    onPaintTerrain(mapData.id, updatedTile)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getMousePos(e)
    const t = getTileFromMouse(x, y)
    setHoveredTile(t)

    if (isDragging) {
      if (mode === "paint" && isGm && e.button === 0 && t) handlePaintTile(t.x, t.y)
      else {
        setOffset(prev => ({ x: prev.x + (x - lastMousePos.x), y: prev.y + (y - lastMousePos.y) }))
        setLastMousePos({ x, y })
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col overflow-hidden">
      <div className="h-14 bg-zinc-950/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-6 shrink-0 relative z-10">
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "view" ? "default" : "ghost"} onClick={() => {setMode("view"); setSelectedTokenId(null)}}><Crosshair className="size-4 mr-2"/> Câmera</Button>
          {isGm && <Button size="sm" variant={mode === "paint" ? "default" : "ghost"} onClick={() => {setMode("paint"); setSelectedTokenId(null)}} className={mode === "paint" ? "bg-primary" : ""}><Brush className="size-4 mr-2"/> Terreno</Button>}
          <Button size="sm" variant={mode === "move" ? "default" : "ghost"} onClick={() => setMode("move")} className={mode === "move" ? "bg-blue-600" : ""}><Move className="size-4 mr-2"/> Interagir/Mover</Button>
          {isGm && <Button size="sm" variant={mode === "place" ? "default" : "ghost"} onClick={() => setMode("place")} className={mode === "place" ? "bg-green-600" : ""}><UserPlus className="size-4 mr-2"/> Posicionar Heróis</Button>}
        </div>

        {mode === "paint" && isGm && (
          <div className="flex gap-2 bg-black/50 p-1 rounded-lg border border-white/10">
            <Button size="sm" variant="ghost" onClick={() => setActiveTerrain("grass")} className={`h-8 px-3 ${activeTerrain === "grass" ? "bg-green-500/20 text-green-400" : ""}`}>Grama (1)</Button>
            <Button size="sm" variant="ghost" onClick={() => setActiveTerrain("mud")} className={`h-8 px-3 ${activeTerrain === "mud" ? "bg-yellow-700/40 text-yellow-500" : ""}`}>Lama (2)</Button>
            <Button size="sm" variant="ghost" onClick={() => setActiveTerrain("water")} className={`h-8 px-3 ${activeTerrain === "water" ? "bg-blue-500/20 text-blue-400" : ""}`}>Água (3)</Button>
            <Button size="sm" variant="ghost" onClick={() => setActiveTerrain("lava")} className={`h-8 px-3 ${activeTerrain === "lava" ? "bg-red-500/20 text-red-400" : ""}`}>Lava (Bloq)</Button>
          </div>
        )}

        <Button size="sm" variant="destructive" onClick={onClose}><X className="size-4 mr-2"/> Sair do Mapa</Button>
      </div>

      <div className="flex-1 flex relative">
        <div className="flex-1 relative cursor-crosshair">
            <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => { setIsDragging(false); setHoveredTile(null) }} onContextMenu={(e) => e.preventDefault()} className="absolute inset-0 w-full h-full"/>
            
            {mode === "move" && !selectedTokenId && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/70 border border-white/10 text-white px-4 py-2 rounded-full pointer-events-none animate-pulse text-sm">
                    Clique em um personagem no mapa para selecioná-lo.
                </div>
            )}
            
            {mode === "place" && (
                 <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-green-500/20 border border-green-500/50 text-green-400 px-4 py-2 rounded-full pointer-events-none text-sm">
                    Selecione alguém na barra lateral direita e clique no grid.
                </div>
            )}
        </div>

        {/* Sidebar Direita para Posicionar */}
        {mode === "place" && (
            <div className="w-64 bg-zinc-950/90 border-l border-white/10 flex flex-col relative z-10 backdrop-blur-md">
                <div className="p-4 border-b border-white/10 shrink-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-primary">Prontidão</p>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {characters.map(c => (
                        <button key={c.id} onClick={() => setTokenToPlace({id: c.id, type: "character"})} className={`w-full flex items-center gap-3 p-2 rounded border transition-colors ${tokenToPlace?.id === c.id ? "border-primary bg-primary/20" : "border-white/5 bg-white/5 hover:border-primary/50"}`}>
                            <img src={c.avatarUrl} className="size-8 rounded object-cover" />
                            <span className="text-sm font-bold text-left text-white">{c.name}</span>
                        </button>
                    ))}
                    {isGm && creatures.map(c => (
                        <button key={c.instanceId} onClick={() => setTokenToPlace({id: c.instanceId, type: "creature"})} className={`w-full flex items-center gap-3 p-2 rounded border transition-colors ${tokenToPlace?.id === c.instanceId ? "border-destructive bg-destructive/20" : "border-white/5 bg-white/5 hover:border-destructive/50"}`}>
                            <img src={c.imageUrl} className="size-8 rounded object-cover" />
                            <span className="text-sm font-bold text-left text-destructive truncate">{c.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        )}
      </div>
    </div>
  )
}