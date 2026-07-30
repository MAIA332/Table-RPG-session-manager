import { NextResponse } from "next/server"
import { publish } from "@/lib/store"
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

  // Propaga o evento no SSE da Campanha para todos os usuários logados nela
  publish(id, {
    type: "dice:roll",
    characterId: body.characterId,
    characterName: body.characterName,
    playerName: body.playerName,
    attribute: body.attribute,
    result: body.result,
  })

  return NextResponse.json({ success: true })
}