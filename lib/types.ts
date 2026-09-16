// Tipos centrais do VTT de Fabula Ultima.
export type Role = "gm" | "player"
export type DieSize = "d6" | "d8" | "d10" | "d12"
export type AttributeKey = "dex" | "ins" | "mig" | "wlp"
export interface StoreFolder {
  id: string
  name: string
  isVisible: boolean
  isSystem?: boolean
}
export interface GalleryFolder {
  id: string
  name: string
  ownerId?: string
  isPlayerFolder?: boolean
}
export interface GalleryImage {
  id: string
  name: string
  url: string
  isPublic?: boolean
  folderId?: string
  ownerId?: string
  ownerName?: string
  createdAt?: number
}
export interface GalleryBroadcastRequest {
  id: string
  imageId: string
  imageName: string
  imageUrl: string
  requesterId: string
  requesterName: string
  createdAt: number
}
export interface CustomItem {
  weight?: number
  weightUnit?: "g" | "kg"
  id: string
  name: string
  type: "text" | "image" | "video" | "app-blueprints"
  content: string
  folderId?: string
}
export interface User {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: number
}
export interface SessionToken {
  token: string
  userId: string
  createdAt: number
}
export interface CampaignMember {
  userId: string
  role: Role
}
export interface Campaign {
  id: string
  name: string
  code: string
  ownerId: string
  members: CampaignMember[]
  createdAt: number
}
export interface ClassLevel {
  classId: string
  level: number
}
export interface EquipmentItem {
  weight?: number
  weightUnit?: "g" | "kg"
  id: string
  name: string
  category: "weapon" | "armor" | "shield" | "accessory"
  cost: number
  detail: string
  purchasable?: boolean
}
export interface CharacterResources {
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  ip: number
  maxIp: number
  fp: number
  xp: number
}
export interface PersonalNote {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}
export interface FlowchartNode {
  id: string
  text: string
  x: number
  y: number
  color?: "bronze" | "blue" | "green" | "red" | "purple"
}
export interface FlowchartEdge {
  id: string
  from: string
  to: string
}
export interface PersonalFlowchart {
  id: string
  title: string
  nodes: FlowchartNode[]
  edges: FlowchartEdge[]
  createdAt: number
  updatedAt: number
}
export interface Character {
  customItems?: CustomItem[]
  id: string
  campaignId: string
  ownerId: string
  name: string
  avatarUrl: string
  portraitFrame?: import("./portrait-frames").PortraitFrameId
  portraitCrop?: import("./portrait-frames").PortraitCrop
  origin: string
  identity: string
  theme: string
  attributes: Record<AttributeKey, DieSize>
  classes: ClassLevel[]
  skills: Record<string, number>
  equipment: string[]
  zenit: number
  resources: CharacterResources
  createdAt: number
  updatedAt: number
}
export interface ItemTransfer {
  donorRetainsItem?: boolean
  sourceItemIndex?: number
  id: string
  campaignId: string
  donorCharacterId: string
  donorCharacterName: string
  donorOwnerId: string
  recipientCharacterId: string
  recipientCharacterName: string
  recipientOwnerId: string
  itemId: string
  itemName: string
  itemKind: "equipment" | "custom"
  customItem?: CustomItem
  donorItemBonusesActive?: boolean
  status: "pending" | "accepted" | "rejected"
  createdAt: number
  resolvedAt?: number
}
export type Affinity = "VU" | "RS" | "IM" | "AB" | "none"
export interface CreatureAction {
  name: string
  attributes: [AttributeKey, AttributeKey]
  damage: number
  type: string
  description?: string
}
export interface Creature {
  id: string
  name: string
  imageUrl: string
  level: number
  species: string
  attributes: Record<AttributeKey, DieSize>
  maxHp: number
  maxMp: number
  def: number
  mdef: number
  affinities: {
    physical: Affinity
    air: Affinity
    bolt: Affinity
    dark: Affinity
    earth: Affinity
    fire: Affinity
    ice: Affinity
    light: Affinity
    poison: Affinity
  }
  basicAttacks: CreatureAction[]
  spells: string[]
  equipment: string[]
  basicAttacksV2?: import("./combat-model").Attack[]
  abilities?: import("./combat-model").Ability[]
  combatVersion?: 2
}
export interface ActiveCreature extends Creature {
  instanceId: string
  currentHp: number
  currentMp: number
  currentIp?: number
}
export interface ActivePoll {
  id: string
  question: string
  options: string[]
  votes: Record<string, number>
  expiresAt: number
}
export type RealtimeEvent =
  | { type: "character:created"; character: Character }
  | { type: "character:updated"; character: Character }
  | { type: "character:deleted"; characterId: string }
  | { type: "item-transfer:created"; transfer: ItemTransfer }
  | {
      type: "item-transfer:resolved"
      transfer: ItemTransfer
      donor: Character
      recipient?: Character
    }
  | { type: "presence"; message: string }
  | { type: "presence:updated"; activeCount: number }
  | {
      type: "dice:roll"
      eventId?: string
      occurredAt?: number
      replay?: boolean
      characterId: string
      characterName: string
      playerName: string
      attribute: string
      result: number | string
      breakdown?: string
      modifier?: number
    }
  | { type: "creature:spawn"; creature: ActiveCreature }
  | {
      type: "creature:update"
      instanceId: string
      updates: Partial<ActiveCreature>
    }
  | { type: "creature:remove"; instanceId: string }
  | { type: "hazard:launch"; hazard: any }
  | { type: "hazard:stop"; hazardType: any }
  | { type: "poll:start"; poll: ActivePoll }
  | { type: "poll:vote"; pollId: string; userId: string; optionIndex: number }
  | { type: "combat:invalidate"; revision: number }
  | { type: "gallery:changed" }
  | { type: "gallery:broadcast-requested"; requestId: string }
  | {
      type: "gallery:broadcast-resolved"
      requestId: string
      requesterId: string
      resolution: "approved" | "rejected"
    }
  | { type: "gallery:image-show"; url: string; name: string }
