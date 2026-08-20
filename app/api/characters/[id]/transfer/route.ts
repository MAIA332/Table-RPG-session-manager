import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, saveToDisk, store } from "@/lib/store"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })

  const { id } = await params
  const character = store.characters.get(id)
  if (!character) return NextResponse.json({ error: "Personagem não encontrado." }, { status: 404 })

  const campaign = store.campaigns.get(character.campaignId)
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })

  const role = getMemberRole(campaign, user.id)
  if (character.ownerId !== user.id && role !== "gm") {
    return NextResponse.json({ error: "Sem permissão para transferir." }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const targetUserId = String(body?.userId ?? "")
  if (!campaign.members.some((member) => member.userId === targetUserId)) {
    return NextResponse.json({ error: "O destino não participa desta campanha." }, { status: 400 })
  }

  character.ownerId = targetUserId
  character.updatedAt = Date.now()
  saveToDisk(store)
  publish(character.campaignId, { type: "character:updated", character })

  return NextResponse.json({ success: true, character })
}
