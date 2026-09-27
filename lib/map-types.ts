export type TerrainType = "grass" | "water" | "lava" | "stone" | "mud" | "wood" | "snow"
export interface TileData {
  x: number
  y: number
  terrain: TerrainType
  movementCost: number
  walkable: boolean
}
export interface GridConfig {
  type: "square" | "hex" | "none"
  tileSize: number
  rows: number
  cols: number
}
export interface MapToken { x: number; y: number; type: "character" | "creature" }
export interface GameMap {
  id: string
  campaignId: string
  name: string
  imageUrl: string
  grid: GridConfig
  tiles: Record<string, TileData>
  tokens: Record<string, MapToken>
  /** Only explicitly revealed maps are sent to players. Legacy maps start hidden. */
  isPublic?: boolean
}
