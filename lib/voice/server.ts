import "server-only"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store } from "@/lib/store"
import { getMongoDb } from "@/lib/mongodb"
import type { Db } from "mongodb"

export const VOICE_MESSAGES_COLLECTION = "voice_chat_messages"
export const VOICE_ATTACHMENTS_COLLECTION = "voice_chat_attachments"

export async function voiceAccess(params: Promise<{ id: string }>) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) } as const
  const { id } = await params
  const campaign = store.campaigns.get(id)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) } as const
  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) } as const
  return { campaignId: id, user, role, error: null } as const
}

/** Negar chamadas mutáveis originadas de outros sites, mesmo com cookies de sessão. */
export function checkVoiceOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin")
  if (!origin) return null // Clientes sem Origin são protegidos pelo cookie SameSite.
  const allowed = new Set<string>([new URL(request.url).origin])
  // Em reverse proxy, configure APP_PUBLIC_ORIGIN. Não confiar em x-forwarded-host
  // vindo do cliente: cabeçalho controlável poderia enfraquecer a proteção CSRF.
  if (process.env.APP_PUBLIC_ORIGIN) allowed.add(process.env.APP_PUBLIC_ORIGIN.replace(/\/$/, ""))
  // O Next.js pode receber a origem interna do túnel SSH em request.url.
  // Autorizar somente a origem local exata no servidor de desenvolvimento.
  // Nunca liberar localhost em produção.
  if (process.env.NODE_ENV === "development") {
    allowed.add("http://localhost:3813")
    allowed.add("http://127.0.0.1:3813")
  }
  if (!allowed.has(origin)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 })
  return null
}

export async function getVoiceDb(): Promise<Db> {
  return getMongoDb()
}

export async function readJsonLimited(request: Request, maxBytes = 3_100_000): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > maxBytes) throw new Error("PAYLOAD_TOO_LARGE")
  const reader = request.body?.getReader()
  if (!reader) throw new Error("INVALID_JSON")
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error("PAYLOAD_TOO_LARGE")
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new Error("INVALID_JSON")
  }
}

export function requestError(error: unknown) {
  if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE")
    return NextResponse.json({ error: "Arquivo ou requisição acima do limite." }, { status: 413 })
  if (error instanceof Error && error.message === "INVALID_JSON")
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
  return NextResponse.json({ error: "Falha interna de processamento." }, { status: 500 })
}
