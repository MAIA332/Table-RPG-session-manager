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
  if (!body || !body.action) return NextResponse.json({ error: "Ação inválida." }, { status: 400 })

  const { id } = await params

  // Propaga as ações do Mestre sobre os monstros em Tempo Real
  if (body.action === "spawn") {
    publish(id, { type: "creature:spawn", creature: body.creature })
  } else if (body.action === "update") {
    publish(id, { type: "creature:update", instanceId: body.instanceId, updates: body.updates })
  } else if (body.action === "remove") {
    publish(id, { type: "creature:remove", instanceId: body.instanceId })
  }

  return NextResponse.json({ success: true })
}