import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { genId, getCampaignPresenceCount, getUserCampaigns, saveToDisk, store } from "@/lib/store"
import type { Campaign } from "@/lib/types"

function makeCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 })
  const campaigns = getUserCampaigns(user.id).map((c) => ({
    ...c,
    role: c.members.find((m) => m.userId === user.id)?.role,
    activeCount: getCampaignPresenceCount(c.id),
  }))
  return NextResponse.json({ campaigns })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = String(body?.name ?? "").trim()
  if (!name) return NextResponse.json({ error: "Informe um nome para a campanha." }, { status: 400 })

  const campaign: Campaign = {
    id: genId("camp"),
    name,
    code: makeCode(),
    ownerId: user.id,
    members: [{ userId: user.id, role: "gm" }],
    createdAt: Date.now(),
  }
  store.campaigns.set(campaign.id, campaign)
  saveToDisk(store)
  return NextResponse.json({ campaign })
}
