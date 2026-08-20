import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { findCampaignByCode, saveToDisk, store } from "@/lib/store"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 })

  const body = await request.json().catch(() => null)
  const code = String(body?.code ?? "").trim().toUpperCase()
  const campaign = findCampaignByCode(code)
  if (!campaign) return NextResponse.json({ error: "Código de campanha inválido." }, { status: 404 })

  if (!campaign.members.some((m) => m.userId === user.id)) {
    campaign.members.push({ userId: user.id, role: "player" })
    saveToDisk(store)
  }
  return NextResponse.json({ campaign })
}
