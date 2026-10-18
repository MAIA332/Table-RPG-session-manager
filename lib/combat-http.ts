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

/** Permite apenas nomes locais e IPs privados no fallback automático de desenvolvimento. */
function isPrivateDevelopmentHost(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]"
  )
    return true

  const octets = hostname.split(".")
  if (
    octets.length !== 4 ||
    octets.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  )
    return false

  const first = Number(octets[0])
  const second = Number(octets[1])
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

/**
 * Public origins are explicit; forwarded headers are not trusted as an allowlist.
 * In development, the HTTP Host can identify a directly accessed LAN address.
 * Production never adds request-derived origins.
 */
export function assertCombatOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site")
  if (site === "cross-site")
    throw new CombatError("Origem não permitida", 403)

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

  if (process.env.NODE_ENV !== "production") {
    // Pode ser localhost dentro do Next.js mesmo que o navegador utilize um IP LAN.
    const requestUrl = new URL(request.url)
    if (isPrivateDevelopmentHost(requestUrl.hostname))
      allowed.add(requestUrl.origin)

    // Use somente o Host recebido diretamente; não aceite X-Forwarded-Host ou
    // X-Forwarded-Proto como fonte de novas origens confiáveis.
    const host = request.headers.get("host")
    if (host && (site === null || site === "same-origin")) {
      try {
        const local = new URL(`http://${host}`)
        // Confere o Host inteiro, inclusive a porta; sem sufixos ou curingas.
        if (
          local.host === host.toLowerCase() &&
          isPrivateDevelopmentHost(local.hostname)
        ) {
          allowed.add(local.origin)
          allowed.add(`https://${local.host}`)
        }
      } catch {
        // Host inválido não autoriza nenhuma origem.
      }
    }
  }

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
      !["http:", "https:"].includes(parsed.protocol) ||
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
