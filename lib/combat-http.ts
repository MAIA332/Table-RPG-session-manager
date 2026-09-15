import { NextResponse } from "next/server"
import { CombatError } from "./combat-server"
export function combatHttpError(error: unknown) {
  if (error instanceof CombatError)
    return NextResponse.json({ error: error.message }, { status: error.status })
  console.error("[combat]", error)
  return NextResponse.json(
    {
      error:
        "Não foi possível confirmar a operação. Atualize o combate antes de tentar novamente.",
    },
    { status: 503 },
  )
}
/** Public origins are explicit; forwarded headers are not trusted as an allowlist. */
export function assertCombatOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site")
  if (site === "cross-site") throw new CombatError("Origem não permitida", 403)

  const configured = process.env.COMBAT_ALLOWED_ORIGINS
  const entries =
    configured !== undefined
      ? configured
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : ["https://app-mortemagica.sinapselabs.com.br"]
  const allowed = new Set<string>()
  for (const entry of entries) {
    const url = new URL(entry)
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      throw new Error(
        "COMBAT_ALLOWED_ORIGINS deve conter origens HTTP(S), sem caminho, credenciais ou curingas.",
      )
    }
    allowed.add(url.origin)
  }
  // Permit the dev server's own origin only outside production.
  if (process.env.NODE_ENV !== "production")
    allowed.add(new URL(request.url).origin)

  const origin = request.headers.get("origin")
  if (origin !== null) {
    let parsed: URL
    try {
      parsed = new URL(origin)
    } catch {
      throw new CombatError("Origem não permitida", 403)
    }
    if (
      parsed.origin === "null" ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !allowed.has(parsed.origin)
    ) {
      throw new CombatError("Origem não permitida", 403)
    }
    return
  }
  // Some same-origin browser requests omit Origin. Do not treat its absence as approval.
  if (site === "same-origin") return
  const referer = request.headers.get("referer")
  if (referer) {
    try {
      if (allowed.has(new URL(referer).origin)) return
    } catch {}
  }
  throw new CombatError("Origem ausente ou não permitida", 403)
}

export async function readCombatBody(request: Request) {
  assertCombatOrigin(request)
  if (Number(request.headers.get("content-length") || 0) > 256000)
    throw new CombatError("Comando muito grande", 413)
  const reader = request.body?.getReader()
  let bytes = 0
  const chunks: Uint8Array[] = []
  if (!reader) throw new CombatError("Corpo ausente")
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > 256000) {
      await reader.cancel()
      throw new CombatError("Comando muito grande", 413)
    }
    chunks.push(value)
  }
  const joined = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.length
  }
  try {
    return JSON.parse(new TextDecoder().decode(joined))
  } catch {
    throw new CombatError("JSON inválido")
  }
}
