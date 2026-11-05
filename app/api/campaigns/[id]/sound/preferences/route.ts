/**
 * app/api/campaigns/[id]/sound/preferences/route.ts
 *
 * Configuracoes persistentes do Soundpad. Em Docker/VPS, defina
 * SOUNDPAD_CONFIG_DIR com um diretorio gravavel em volume persistente.
 * O backup do navegador nunca e tratado como confirmacao do servidor.
 */
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getCampaignState } from "@/lib/campaign-state"
import { getMemberRole, store } from "@/lib/store"
import {
  normalizeSoundFolders, normalizeSoundHotkeys,
  type SoundFolder, type SoundHotkey,
} from "@/lib/sound-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_PAYLOAD_BYTES = 1024 * 1024
const CONFIG_DIR = resolve(process.env.SOUNDPAD_CONFIG_DIR || join(process.cwd(), ".soundpad-data"))

type Params = { params: Promise<{ id: string }> }
type Kind = "soundFolders" | "soundHotkeys"
type PreferenceData = SoundFolder[] | SoundHotkey[]

// Serializa POSTs da mesma campanha/campo na mesma instancia Node.
// Em implantações com varias instancias, o volume/banco compartilhado ainda e necessario.
const writeQueues = new Map<string, Promise<void>>()

async function authorized(params: Params["params"]): Promise<{ id: string } | { error: NextResponse }> {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }

  const { id } = await params
  const campaign = store.campaigns.get(id)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }
  if (getMemberRole(campaign, user.id) !== "gm") {
    return { error: NextResponse.json({ error: "Apenas o mestre pode configurar a biblioteca sonora." }, { status: 403 }) }
  }
  return { id }
}

function filePath(campaignId: string, kind: Kind): string {
  // IDs externos nunca se tornam diretamente segmentos de caminho.
  return join(CONFIG_DIR, `${Buffer.from(campaignId).toString("hex")}.${kind}.json`)
}

function normalize(kind: Kind, value: unknown): PreferenceData {
  return kind === "soundFolders" ? normalizeSoundFolders(value) : normalizeSoundHotkeys(value)
}

function samePreference(kind: Kind, left: unknown, right: unknown): boolean {
  return JSON.stringify(normalize(kind, left)) === JSON.stringify(normalize(kind, right))
}

async function readPreference(kind: "soundFolders", id: string): Promise<SoundFolder[] | null>
async function readPreference(kind: "soundHotkeys", id: string): Promise<SoundHotkey[] | null>
async function readPreference(kind: Kind, id: string): Promise<PreferenceData | null>
async function readPreference(kind: Kind, id: string): Promise<PreferenceData | null> {
  let raw: string
  try {
    raw = await readFile(filePath(id, kind), "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error(`Arquivo de preferências inválido (${kind}): lista esperada.`)
  return normalize(kind, parsed)
}

async function writePreference(id: string, kind: Kind, data: PreferenceData): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 })
  const destination = filePath(id, kind)
  const temporary = `${destination}.${randomUUID()}.tmp`

  try {
    await writeFile(temporary, JSON.stringify(data), { encoding: "utf8", flag: "wx", mode: 0o600 })
    await rename(temporary, destination)

    // Confirmar por leitura no proprio servidor, nunca pelo localStorage.
    const verified = await readPreference(kind, id)
    if (verified === null || !samePreference(kind, verified, data)) {
      const error = new Error(`Falha na verificação da gravação de ${kind}.`) as NodeJS.ErrnoException
      error.code = "EVERIFY"
      throw error
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}

function enqueueWrite(id: string, kind: Kind, data: PreferenceData): Promise<void> {
  const key = `${id}:${kind}`
  const previous = writeQueues.get(key) ?? Promise.resolve()
  const job = previous.then(() => writePreference(id, kind, data))
  const settled = job.then(() => undefined, () => undefined)
  writeQueues.set(key, settled)
  void settled.then(() => {
    if (writeQueues.get(key) === settled) writeQueues.delete(key)
  })
  return job
}

function storageError(error: unknown): { message: string; status: number; code: string } {
  const code = (error as NodeJS.ErrnoException)?.code || "EUNKNOWN"
  if (code === "EACCES" || code === "EPERM") {
    return { code, status: 503, message: "Sem permissão para gravar as configurações do Soundpad. Verifique SOUNDPAD_CONFIG_DIR e o usuário do processo." }
  }
  if (code === "EROFS") {
    return { code, status: 503, message: "O diretório de configuração está em um sistema de arquivos somente leitura. Use um volume persistente gravável em SOUNDPAD_CONFIG_DIR." }
  }
  if (code === "ENOSPC" || code === "EDQUOT") {
    return { code, status: 507, message: "O armazenamento das configurações está sem espaço disponível." }
  }
  if (code === "EVERIFY") {
    return { code, status: 503, message: "A configuração foi gravada, mas não foi possível confirmar seu conteúdo." }
  }
  return { code: typeof code === "string" ? code : "EUNKNOWN", status: 500, message: "Falha ao salvar a configuração do Soundpad no servidor." }
}

export async function GET(_request: Request, { params }: Params) {
  const access = await authorized(params)
  if ("error" in access) return access.error

  try {
    const [diskFolders, diskHotkeys] = await Promise.all([
      readPreference("soundFolders", access.id),
      readPreference("soundHotkeys", access.id),
    ])

    // Compatibilidade com instalações anteriores: se nao existe arquivo,
    // ler o estado antigo. O POST continuara gravando no arquivo dedicado.
    const legacy = diskFolders === null || diskHotkeys === null
      ? getCampaignState(access.id)
      : null

    // Reflect evita depender da tipagem exata de versões antigas de CampaignState.
    const legacyFolders = legacy ? Reflect.get(legacy, "soundFolders") : undefined
    const legacyHotkeys = legacy ? Reflect.get(legacy, "soundHotkeys") : undefined

    return NextResponse.json({
      success: true,
      soundFolders: diskFolders ?? normalizeSoundFolders(legacyFolders),
      soundHotkeys: diskHotkeys ?? normalizeSoundHotkeys(legacyHotkeys),
      stored: { folders: diskFolders !== null, hotkeys: diskHotkeys !== null },
      legacyIncluded: true,
    }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("[sound/preferences] Erro no GET:", { campaignId: access.id, dir: CONFIG_DIR, error })
    return NextResponse.json({ error: "Não foi possível ler as configurações do Soundpad." }, {
      status: 500, headers: { "Cache-Control": "private, no-store" },
    })
  }
}

export async function POST(request: Request, { params }: Params) {
  const access = await authorized(params)
  if ("error" in access) return access.error

  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Configuração grande demais." }, { status: 413 })
  }

  const raw = await request.text().catch(() => "")
  if (Buffer.byteLength(raw, "utf8") > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Configuração grande demais." }, { status: 413 })
  }

  let body: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>
    }
  } catch { /* JSON invalido */ }

  const keys = body ? Object.keys(body) : []
  const kind = keys.length === 1 && (keys[0] === "soundFolders" || keys[0] === "soundHotkeys")
    ? keys[0] as Kind : null
  if (!kind || !Array.isArray(body?.[kind])) {
    return NextResponse.json({ error: "Envie somente soundFolders ou soundHotkeys como uma lista." }, { status: 400 })
  }

  const normalized = normalize(kind, body[kind])
  try {
    await enqueueWrite(access.id, kind, normalized)
    return NextResponse.json({ success: true, [kind]: normalized }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    const diagnostic = storageError(error)
    console.error("[sound/preferences] Erro no POST:", {
      campaignId: access.id, kind, dir: CONFIG_DIR,
      code: diagnostic.code, error,
    })
    return NextResponse.json({ success: false, error: diagnostic.message, code: diagnostic.code }, {
      status: diagnostic.status,
      headers: { "Cache-Control": "private, no-store" },
    })
  }
}
