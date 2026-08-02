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

  if (body.action === "start") {
    publish(id, { type: "poll:start", poll: body.poll })
  } else if (body.action === "vote") {
    publish(id, { 
      type: "poll:vote", 
      pollId: body.pollId, 
      userId: body.userId, 
      optionIndex: body.optionIndex 
    })
  }

  return NextResponse.json({ success: true })
}