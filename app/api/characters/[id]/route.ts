import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import {
  deleteCharacterFromStore,
  getMemberRole,
  publish,
  saveToDisk,
  store,
  transactStore,
} from "@/lib/store"
import { normalizeResources } from "@/lib/character"
import {
  assertInventoryChange,
  InventoryCapacityError,
  itemWeightGrams,
} from "@/lib/inventory-weight"
import { campaignItemCatalog } from "@/lib/inventory-server"
import {
  normalizePortraitCrop,
  normalizePortraitFrame,
} from "@/lib/portrait-frames"
import type { Character } from "@/lib/types"
class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  try {
    const updated = transactStore((db) => {
      const current = db.characters.get(id)
      if (!current) throw new RequestError("Personagem não encontrado.", 404)
      const campaign = db.campaigns.get(current.campaignId)
      const role = campaign && getMemberRole(campaign, user.id)
      if (!role || (current.ownerId !== user.id && role !== "gm"))
        throw new RequestError("Sem permissão para editar.", 403)
      if (
        (body.avatarUrl !== undefined || body.portraitCrop !== undefined) &&
        current.ownerId !== user.id
      )
        throw new RequestError("Apenas o dono pode alterar o retrato.", 403)
      const next = structuredClone(current) as Character & {
        customModifiers?: any[]
      }
      if (body.avatarUrl !== undefined) {
        const avatar = String(body.avatarUrl).trim()
        if (
          avatar.length > 3500000 ||
          !(
            avatar.startsWith("/") ||
            /^https?:\/\//i.test(avatar) ||
            /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(avatar)
          )
        )
          throw new RequestError("Imagem de retrato inválida ou muito grande.")
        next.avatarUrl = avatar
      }
      if (body.resources !== undefined) {
        if (
          !body.resources ||
          typeof body.resources !== "object" ||
          Array.isArray(body.resources)
        )
          throw new RequestError("Recursos inválidos.")
        for (const [key, value] of Object.entries(body.resources)) {
          if (key === "ip" || (key === "xp" && role !== "gm")) continue
          if (!(key in current.resources)) continue
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
            throw new RequestError("Recursos devem ser números não negativos.")
          if (
            key === "maxIp" &&
            role !== "gm" &&
            value !== current.resources.maxIp
          )
            throw new RequestError(
              "Apenas o Mestre pode alterar a capacidade da mochila.",
              403,
            )
          if (
            key === "maxIp" &&
            Math.abs(value * 1000 - Math.round(value * 1000)) > 0.000001
          )
            throw new RequestError("Capacidade deve ter precisão de 1 grama.")
          ;(next.resources as any)[key] = value
        }
      }
      for (const key of [
        "skills",
        "attributes",
        "classes",
        "customModifiers",
      ] as const)
        if (body[key] !== undefined) {
          const value = body[key]
          if (
            !value ||
            typeof value !== "object" ||
            (["classes", "customModifiers"].includes(key) &&
              !Array.isArray(value))
          )
            throw new RequestError(`Campo ${key} inválido.`)
          ;(next as any)[key] = value
        }
      if (
        !next.attributes ||
        !["dex", "ins", "mig", "wlp"].every((key) =>
          /^d(6|8|10|12)$/.test((next.attributes as any)[key]),
        )
      )
        throw new RequestError("Dados de atributos inválidos.")
      if (body.equipment !== undefined) {
        if (
          !Array.isArray(body.equipment) ||
          body.equipment.some((id: unknown) => typeof id !== "string")
        )
          throw new RequestError("Equipamentos inválidos.")
        next.equipment = body.equipment
      }
      if (body.customItems !== undefined) {
        if (!Array.isArray(body.customItems))
          throw new RequestError("Itens personalizados inválidos.")
        for (const item of body.customItems) {
          if (
            !item ||
            typeof item.id !== "string" ||
            typeof item.name !== "string"
          )
            throw new RequestError("Item personalizado inválido.")
          itemWeightGrams(item)
        }
        next.customItems = body.customItems
      }
      if (body.zenit !== undefined) {
        if (
          typeof body.zenit !== "number" ||
          !Number.isFinite(body.zenit) ||
          body.zenit < 0
        )
          throw new RequestError("Zenit inválido.")
        next.zenit = body.zenit
      }
      for (const key of ["origin", "identity", "theme"] as const)
        if (body[key] !== undefined)
          next[key] = String(body[key]).trim().slice(0, 20000)
      next.portraitFrame = normalizePortraitFrame(
        body.portraitFrame ?? current.portraitFrame,
      )
      next.portraitCrop = normalizePortraitCrop(
        body.portraitCrop ?? current.portraitCrop,
      )
      const catalog = campaignItemCatalog(db, current.campaignId)
      assertInventoryChange(current, next, catalog)
      const result = normalizeResources(
        { ...next, updatedAt: Math.max(Date.now(), current.updatedAt + 1) },
        catalog,
      )
      db.characters.set(id, result)
      return { value: result, changed: true }
    })
    publish(updated.campaignId, {
      type: "character:updated",
      character: updated,
    })
    return NextResponse.json({ character: updated })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Não foi possível salvar.",
      },
      {
        status:
          error instanceof InventoryCapacityError
            ? 409
            : error instanceof RequestError
              ? error.status
              : 400,
      },
    )
  }
}
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params,
    character = store.characters.get(id)
  if (!character)
    return NextResponse.json(
      { error: "Personagem não encontrado." },
      { status: 404 },
    )
  const campaign = store.campaigns.get(character.campaignId),
    role = campaign && getMemberRole(campaign, user.id)
  if (character.ownerId !== user.id && role !== "gm")
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  deleteCharacterFromStore(id)
  saveToDisk(store)
  publish(character.campaignId, { type: "character:deleted", characterId: id })
  return NextResponse.json({ ok: true })
}
