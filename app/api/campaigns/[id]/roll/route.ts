import { NextResponse } from "next/server"
import { getMemberRole, publish, store } from "@/lib/store"
import { getCurrentUser } from "@/lib/auth"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 })

  const { id } = await params

  const campaign = store.campaigns.get(id)
  if (!campaign)
    return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })
  const role = getMemberRole(campaign, user.id)
  if (!role)
    return NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 })

  const attribute = String(body.attribute || "")
  if (
    role !== "gm" &&
    (attribute.startsWith("SYNC_IMAGE:") ||
      attribute.startsWith("SYNC_GALLERY:"))
  ) {
    return NextResponse.json(
      { error: "Apenas o mestre pode transmitir ou sincronizar a galeria." },
      { status: 403 },
    )
  }

  // Propaga o evento no SSE da Campanha para todos os usuários logados nela
  publish(id, {
    type: "dice:roll",
    characterId: body.characterId,
    characterName: body.characterName,
    playerName: body.playerName,
    attribute: body.attribute,
    result: body.result,
    breakdown: body.breakdown,
    modifier: body.modifier,
  })

  return NextResponse.json({ success: true })
}
