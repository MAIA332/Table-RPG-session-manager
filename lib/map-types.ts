export type TerrainType = "grass" | "water" | "lava" | "stone" | "mud" | "wood" | "snow";

export interface TileData {
  x: number;
  y: number;
  terrain: TerrainType;
  movementCost: number;
  walkable: boolean;
}

export interface GridConfig {
  type: "square" | "hex" | "none";
  tileSize: number;
  rows: number;
  cols: number;
}

export interface MapToken {
  x: number;
  y: number;
  type: "character" | "creature";
}

export interface GameMap {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string; // Salvaremos em Base64 para sincronizar sem precisar de S3/AWS
  grid: GridConfig;
  tiles: Record<string, TileData>;
  tokens: Record<string, MapToken>; // Guarda onde cada ID de personagem/criatura está
}