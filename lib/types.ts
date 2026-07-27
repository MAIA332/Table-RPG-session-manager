// Tipos centrais do VTT de Fabula Ultima ("Over the Magic School")

export type Role = "gm" | "player"

export type DieSize = "d6" | "d8" | "d10" | "d12"

export type AttributeKey = "dex" | "ins" | "mig" | "wlp"

export interface User {
  id: string
  email: string
  name: string
  // hash simples (nao use em producao real)
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
  id: string
  name: string
  category: "weapon" | "armor" | "shield" | "accessory"
  cost: number
  detail: string
}

export interface CharacterResources {
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  ip: number
  maxIp: number
  fp: number
}

export interface Character {
  id: string
  campaignId: string
  ownerId: string
  name: string
  avatarUrl: string
  origin: string
  identity: string
  theme: string
  attributes: Record<AttributeKey, DieSize>
  classes: ClassLevel[]
  equipment: string[] // ids de EquipmentItem
  zenit: number
  resources: CharacterResources
  createdAt: number
  updatedAt: number
}

// Eventos transmitidos via SSE (sistema realtime local)
export type RealtimeEvent =
  | { type: "character:created"; character: Character }
  | { type: "character:updated"; character: Character }
  | { type: "character:deleted"; characterId: string }
  | { type: "presence"; message: string }
