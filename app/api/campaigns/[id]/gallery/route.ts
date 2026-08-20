import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store } from "@/lib/store"
import fs from "fs/promises"
import path from "path"

function getGalleryFilePath(campaignId: string) {
  return path.join(process.cwd(), "data", `gallery_${campaignId}.json`)
}

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

  try {
    const data = await fs.readFile(getGalleryFilePath(access.campaignId), "utf-8")
    return NextResponse.json({ images: JSON.parse(data) })
  } catch (error: any) {
    if (error?.code === "ENOENT") return NextResponse.json({ images: [] })
    return NextResponse.json({ error: "Erro ao ler galeria." }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  if (access.role !== "gm") return NextResponse.json({ error: "Apenas o mestre pode editar a galeria." }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!Array.isArray(body?.images)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })

  const directory = path.join(process.cwd(), "data")
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(getGalleryFilePath(access.campaignId), JSON.stringify(body.images, null, 2), "utf-8")
  return NextResponse.json({ success: true })
}
