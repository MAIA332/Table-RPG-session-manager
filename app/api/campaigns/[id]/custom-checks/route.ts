import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store, transactStore } from "@/lib/store"
import { CUSTOM_CHECK_LIMIT, readCustomChecks, validateCustomCheck } from "@/lib/custom-checks"
import type { RealtimeEvent } from "@/lib/types"

type RouteContext = { params: Promise<{ id: string }> }

async function authenticate(context: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) } as const
  const { id } = await context.params
  const campaign = store.campaigns.get(id)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) } as const
  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) } as const
  return { id, role, error: null } as const
}

/** A resposta pública não contém nomes, descrições ou dados de testes ocultos. */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await authenticate(context)
  if (auth.error) return auth.error
  const state = store.campaignState.get(auth.id)
  const checks = readCustomChecks(state)
  return NextResponse.json({
    checks: auth.role === "gm" ? checks : checks.filter(check => check.isPublic),
    revision: Number(state?.customChecksRevision ?? 0),
  })
}

/** Alterações são serializadas e persistidas na coleção campaignState do MongoDB. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticate(context)
  if (auth.error) return auth.error
  if (auth.role !== "gm") return NextResponse.json({ error: "Somente o mestre pode gerenciar testes." }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })

  try {
    const result = await transactStore(draft => {
      const previous = draft.campaignState.get(auth.id) ?? {}
      const checks = readCustomChecks(previous)
      const revision = Number(previous.customChecksRevision ?? 0)
      if (!Number.isSafeInteger(body.revision) || body.revision !== revision)
        throw new Error("Lista de testes desatualizada. Atualize o painel antes de salvar.")
      let next = checks
      if (body.action === "save") {
        const check = validateCustomCheck(body.check)
        const index = checks.findIndex(item => item.id === check.id)
        next = index < 0 ? [...checks, check] : checks.map(item => item.id === check.id ? check : item)
        if (next.length > CUSTOM_CHECK_LIMIT) throw new Error("Limite de 100 testes personalizados por campanha.")
      } else if (body.action === "visibility") {
        if (typeof body.id !== "string" || typeof body.isPublic !== "boolean" || !checks.some(item => item.id === body.id))
          throw new Error("Teste não encontrado ou visibilidade inválida.")
        next = checks.map(item => item.id === body.id ? { ...item, isPublic: body.isPublic } : item)
      } else if (body.action === "delete") {
        if (typeof body.id !== "string" || !checks.some(item => item.id === body.id))
          throw new Error("Teste não encontrado.")
        next = checks.filter(item => item.id !== body.id)
      } else {
        throw new Error("Ação desconhecida.")
      }
      const nextRevision = revision + 1
      draft.campaignState.set(auth.id, { ...previous, customChecks: next, customChecksRevision: nextRevision })
      return { value: { revision: nextRevision }, changed: true }
    })
    // O evento é um aviso de invalidação, nunca transporta dados secretos.
    publish(auth.id, { type: "custom-checks:updated", revision: result.revision } as unknown as RealtimeEvent)
    return NextResponse.json({ success: true, revision: result.revision })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar o teste."
    return NextResponse.json({ error: message }, { status: message.includes("desatualizada") ? 409 : 400 })
  }
}
    