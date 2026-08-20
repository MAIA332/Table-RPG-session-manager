import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, registerCampaignPresence, releaseCampaignPresence, store, subscribe } from "@/lib/store"
import type { RealtimeEvent } from "@/lib/types"

// Sistema realtime local via Server-Sent Events.
// Cada cliente abre um stream e recebe eventos publicados no barramento em memoria.
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return new Response("Nao autenticado", { status: 401 })

  const { campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign || !getMemberRole(campaign, user.id)) {
    return new Response("Sem acesso", { status: 403 })
  }

  const encoder = new TextEncoder()
  const connectionId = new URL(request.url).searchParams.get("connectionId")?.trim() || undefined
  let unsubscribe: () => void = () => {}
  let unregisterPresence: () => void = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closed = false

  const cleanup = () => {
    if (closed) return
    closed = true
    if (heartbeat) clearInterval(heartbeat)
    unsubscribe()
    unregisterPresence()
  }

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RealtimeEvent | { type: "ready" }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      send({ type: "ready" })

      unsubscribe = subscribe(campaignId, (event) => send(event))
      unregisterPresence = registerCampaignPresence(campaignId, user.id, connectionId)

      // heartbeat para manter a conexao viva
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`))
      }, 20000)
    },
    cancel() {
      cleanup()
    },
  })

  request.signal.addEventListener("abort", cleanup, { once: true })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return new Response("Nao autenticado", { status: 401 })

  const { campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign || !getMemberRole(campaign, user.id)) return new Response("Sem acesso", { status: 403 })

  const connectionId = new URL(request.url).searchParams.get("connectionId")?.trim()
  if (!connectionId || connectionId.length > 100) return new Response("Conexao invalida", { status: 400 })
  releaseCampaignPresence(campaignId, user.id, connectionId)
  return new Response(null, { status: 204 })
}
