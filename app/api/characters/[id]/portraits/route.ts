import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, transactStore } from "@/lib/store"
import { normalizePortraitCrop } from "@/lib/portrait-frames"
import { validateAlternatePortraits, MAX_CHARACTER_PORTRAITS, characterPortraitLimit, type AlternatePortrait } from "@/lib/portrait-gallery"
import type { Character } from "@/lib/types"

class PortraitRequestError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** Salva retratos sem interferir no PATCH geral, em HP/MP ou nos itens. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "Dados de retrato inválidos." }, { status: 400 })

  try {
    const data = body as any
    if (typeof data.portraitLabel !== "string" || !data.portraitLabel.trim() || data.portraitLabel.trim().length > 60)
      throw new PortraitRequestError("A legenda do avatar principal deve ter entre 1 e 60 caracteres.")
    let portraitGallery: AlternatePortrait[]
    try { portraitGallery = validateAlternatePortraits(data.portraitGallery, MAX_CHARACTER_PORTRAITS) }
    catch (reason) {
      throw new PortraitRequestError(reason instanceof Error ? reason.message : "Galeria de retratos inválida.")
    }
    if (typeof data.avatarUrl !== "string" || !data.avatarUrl.trim())
      throw new PortraitRequestError("Informe a imagem principal do personagem.")
    const avatarUrl = data.avatarUrl.trim()
    const legacyAvatarAllowed = avatarUrl.startsWith("/") ||
      /^https?:\/\//i.test(avatarUrl) ||
      /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(avatarUrl)
    // O avatar principal preserva os formatos do editor anterior.
    // As alternativas também aceitam os uploads comprimidos validados acima.
    if (avatarUrl.length > 3_500_000 || !legacyAvatarAllowed)
      throw new PortraitRequestError("Imagem principal inválida ou muito grande.")
    if (portraitGallery.some(item => item.url === avatarUrl))
      throw new PortraitRequestError("A imagem principal não pode estar duplicada na galeria.")
    if (avatarUrl.length + portraitGallery.reduce((sum, item) => sum + item.url.length, 0) > 10_000_000)
      throw new PortraitRequestError("As imagens da galeria devem ocupar no máximo 10 MB no total. Reduza as imagens e tente novamente.")

    const updated = await transactStore(db => {
      const current = db.characters.get(id)
      if (!current) throw new PortraitRequestError("Personagem não encontrado.", 404)
      const campaign = db.campaigns.get(current.campaignId)
      const role = campaign ? getMemberRole(campaign, user.id) : null
      if (!role || (current.ownerId !== user.id && role !== "gm"))
        throw new PortraitRequestError("Somente o dono da ficha ou o Mestre podem editar retratos.", 403)
      if (portraitGallery.length + 1 > characterPortraitLimit(current.portraitLimit))
        throw new PortraitRequestError(`Limite de ${characterPortraitLimit(current.portraitLimit)} retratos definido pelo Mestre.`)

      const next = {
        ...current,
        avatarUrl,
        portraitCrop: normalizePortraitCrop(data.portraitCrop ?? current.portraitCrop),
        portraitLabel: data.portraitLabel.trim(),
        portraitGallery: portraitGallery as AlternatePortrait[],
        updatedAt: Math.max(Date.now(), Number(current.updatedAt || 0) + 1),
      } as Character & { portraitLabel: string; portraitGallery: AlternatePortrait[] }
      db.characters.set(id, next)
      return { value: next, changed: true }
    })
    publish(updated.campaignId, { type: "character:updated", character: updated })
    return NextResponse.json({ character: updated })
  } catch (error) {
    const status = error instanceof PortraitRequestError ? error.status : 500
    if (status === 500) console.error("[CHARACTER_PORTRAITS_SAVE]", { characterId: id, error })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar os retratos." }, { status })
  }
}

/** Apenas o Mestre pode alterar o limite de retratos de uma ficha, até 50. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || !Number.isInteger(body.limit) || body.limit < 1 || body.limit > MAX_CHARACTER_PORTRAITS)
    return NextResponse.json({ error: "Informe um limite entre 1 e 50." }, { status: 400 })
  try {
    const updated = await transactStore(db => {
      const current = db.characters.get(id)
      if (!current) throw new PortraitRequestError("Personagem não encontrado.", 404)
      const campaign = db.campaigns.get(current.campaignId)
      if (!campaign || getMemberRole(campaign, user.id) !== "gm")
        throw new PortraitRequestError("Somente o Mestre pode configurar o limite.", 403)
      if ((current.portraitGallery?.length || 0) + 1 > body.limit)
        throw new PortraitRequestError("Exclua os retratos excedentes antes de reduzir o limite.")
      const next: Character = { ...current, portraitLimit: body.limit,
        updatedAt: Math.max(Date.now(), Number(current.updatedAt || 0) + 1) }
      db.characters.set(id, next)
      return { value: next, changed: true }
    })
    publish(updated.campaignId, { type: "character:updated", character: updated })
    return NextResponse.json({ character: updated })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível alterar o limite." },
      { status: error instanceof PortraitRequestError ? error.status : 500 })
  }
}
