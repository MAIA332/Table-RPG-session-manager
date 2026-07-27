import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store, subscribe } from "@/lib/store"
import type { RealtimeEvent } from "@/lib/types"

// Sistema realtime local via Server-Sent Events.
// Cada cliente abre um stream e recebe eventos publicados no barramento em memoria.
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
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
  let unsubscribe: () => void = () => {}
  let heartbeat: ReturnType<typeof setInterval>

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RealtimeEvent | { type: "ready" }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      send({ type: "ready" })

      unsubscribe = subscribe(campaignId, (event) => send(event))

      // heartbeat para manter a conexao viva
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`))
      }, 20000)
    },
    cancel() {
      clearInterval(heartbeat)
      unsubscribe()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
