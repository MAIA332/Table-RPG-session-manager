import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getCombat, commandCombat, CombatError } from "@/lib/combat-server"
import { combatHttpError, readCombatBody } from "@/lib/combat-http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser()
    if (!user)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const { id } = await params
    return NextResponse.json(
      { creatures: getCombat(id, user.id).creatures },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return combatHttpError(error)
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser()
    if (!user)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const { id } = await params,
      body = await readCombatBody(request),
      state = getCombat(id, user.id)
    if (state.viewerRole !== "gm")
      throw new CombatError("Ação exclusiva do Mestre", 403)
    const type =
      body?.action === "spawn"
        ? "spawn"
        : body?.action === "update"
          ? "update-creature"
          : body?.action === "remove"
            ? "remove-creature"
            : null
    if (!type) throw new CombatError("Ação inválida")
    const combat = commandCombat(id, user.id, {
      ...body,
      type,
      commandId: body.commandId || randomUUID(),
      expectedRevision: body.expectedRevision ?? state.revision,
    })
    return NextResponse.json({
      success: true,
      creatures: combat.creatures,
      combat,
    })
  } catch (error) {
    return combatHttpError(error)
  }
}
