import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getCombat } from "@/lib/combat-server"
import { subscribe } from "@/lib/store"
import { subscribeCombatFile } from "@/lib/combat-file-notifications"
import { combatHttpError } from "@/lib/combat-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser()
    if (!user)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const { id } = await params
    const initial = getCombat(id, user.id)
    const encoder = new TextEncoder()
    let cleanup = () => {}
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false
        let last = ""
        let queued: ReturnType<typeof setTimeout> | undefined
        let heartbeat: ReturnType<typeof setInterval> | undefined
        let lease: ReturnType<typeof setTimeout> | undefined
        let unsubscribe = () => {}
        let unsubscribeFile = () => {}
        cleanup = () => {
          if (closed) return
          closed = true
          unsubscribe()
          unsubscribeFile()
          if (queued) clearTimeout(queued)
          if (heartbeat) clearInterval(heartbeat)
          if (lease) clearTimeout(lease)
          request.signal.removeEventListener("abort", cleanup)
          try {
            controller.close()
          } catch {}
        }
        const emit = (snapshot: typeof initial) => {
          const { serverNow, ...data } = snapshot
          const signature = JSON.stringify(data)
          if (signature === last) return
          last = signature
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`),
          )
        }
        const queueRefresh = () => {
          if (closed || queued) return
          // Coalesce publication and filesystem notifications for the same write.
          queued = setTimeout(() => {
            queued = undefined
            if (closed) return
            try {
              emit(getCombat(id, user.id))
            } catch {
              cleanup()
            }
          }, 25)
        }
        unsubscribe = subscribe(id, queueRefresh)
        unsubscribeFile = subscribeCombatFile(queueRefresh)
        try {
          emit(initial)
        } catch {
          cleanup()
          return
        }
        // Catch a change between the initial read and subscription registration.
        queueRefresh()
        // Heartbeat only writes a comment; it does not read the database.
        heartbeat = setInterval(() => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`: keep-alive ${Date.now()}\n\n`))
          } catch {
            cleanup()
          }
        }, 15000)
        // Reauthenticate on reconnection, based on elapsed time rather than event count.
        lease = setTimeout(cleanup, 60000)
        request.signal.addEventListener("abort", cleanup, { once: true })
        if (request.signal.aborted) cleanup()
      },
      cancel() {
        cleanup()
      },
    })
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    return combatHttpError(error)
  }
}
