import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store } from "@/lib/store"
import { getCampaignState, updateCampaignState } from "@/lib/campaign-state"

async function getAccess(params: Promise<{ id: string }>) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }

  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }

  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }

  return { campaignId, role }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  const images = getCampaignState(access.campaignId).gallery
  return NextResponse.json({ images: access.role === "gm" ? images : images.filter((image: any) => image?.isPublic) })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  if (access.role !== "gm") return NextResponse.json({ error: "Apenas o mestre pode editar a galeria." }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!Array.isArray(body?.images)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })

  const state = updateCampaignState(access.campaignId, { gallery: body.images })
  return NextResponse.json({ success: true, images: state.gallery })
}
