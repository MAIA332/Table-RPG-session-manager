import { getCurrentUser } from "@/lib/auth"
import { getPresenceSnapshot, subscribeToPresence } from "@/lib/store"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return new Response("Nao autenticado", { status: 401 })

  const encoder = new TextEncoder()
  let unsubscribe: () => void = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closed = false

  const cleanup = () => {
    if (closed) return
    closed = true
    if (heartbeat) clearInterval(heartbeat)
    unsubscribe()
  }

  const stream = new ReadableStream({
    start(controller) {
      const send = (campaigns: Record<string, number>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "presence:snapshot", campaigns })}\n\n`))
      }
      send(getPresenceSnapshot())
      unsubscribe = subscribeToPresence(send)
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 20000)
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
