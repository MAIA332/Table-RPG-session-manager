import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store } from "@/lib/store"
import { creatorClassCatalog, creatorEquipmentCatalog, readCampaignDeathTokens } from "@/lib/death-tokens-server"
export const dynamic = "force-dynamic"
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const campaign = store.campaigns.get(id)
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })
  const role = getMemberRole(campaign, user.id)
  if (!role) return NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 })
  const requestedTokenId = new URL(request.url).searchParams.get("tokenId")
  const token = readCampaignDeathTokens(store.campaignState.get(id)).find(item =>
    item.id === requestedTokenId && item.userId === user.id && item.status === "available")
  return NextResponse.json({
    classes: creatorClassCatalog(id, role === "gm", token),
    equipment: creatorEquipmentCatalog(id).filter(item => role === "gm" || item.purchasable !== false || token?.startingItemIds.includes(item.id)),
  })
}
    