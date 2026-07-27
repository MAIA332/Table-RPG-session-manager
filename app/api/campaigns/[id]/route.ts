import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getCampaignCharacters, getMemberRole, store } from "@/lib/store"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 })

  const { id } = await params
  const campaign = store.campaigns.get(id)
  if (!campaign) return NextResponse.json({ error: "Campanha nao encontrada." }, { status: 404 })

  const role = getMemberRole(campaign, user.id)
  if (!role) return NextResponse.json({ error: "Voce nao participa desta campanha." }, { status: 403 })

  const members = campaign.members.map((m) => {
    const u = store.users.get(m.userId)
    return { userId: m.userId, role: m.role, name: u?.name ?? "Desconhecido" }
  })

  return NextResponse.json({
    campaign: { id: campaign.id, name: campaign.name, code: campaign.code, ownerId: campaign.ownerId },
    role,
    members,
    characters: getCampaignCharacters(id),
    me: { id: user.id, name: user.name },
  })
}
