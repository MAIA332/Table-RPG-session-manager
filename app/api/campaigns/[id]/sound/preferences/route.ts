/**
 * Substitua: app/api/campaigns/[id]/sound/preferences/route.ts
 *
 * O cargo de mestre e a permissao de escrita do SO sao verificacoes diferentes.
 * Preferir a persistencia existente de /state quando ela suporta estes campos.
 * Caso contrario, gravar em um diretorio persistente gravavel (configurado ou
 * no diretorio de dados do usuario do processo), sem tratar /tmp como definitivo.
 */
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import {
  CAMPAIGN_STATE_ARRAY_FIELDS, getCampaignState, updateCampaignState,
} from "@/lib/campaign-state"
import { getMemberRole, store } from "@/lib/store"
import {
  normalizeSoundFolders, normalizeSoundHotkeys,
  type SoundFolder, type SoundHotkey,
} from "@/lib/sound-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BYTES = 1024 * 1024
const stateFields = new Set<string>(CAMPAIGN_STATE_ARRAY_FIELDS)
const configuredDir = process.env.SOUNDPAD_CONFIG_DIR?.trim()
const legacyDir = resolve(process.cwd(), ".soundpad-data")
const userDir = resolve(homedir(), ".local", "share", "rpg-soundpad")

// A configuracao explicita tem prioridade absoluta; nunca a ignoramos.
// Sem configuracao, um diretorio pertencente ao usuario evita EACCES na raiz do projeto.
const dirs = configuredDir
  ? [resolve(configuredDir)]
  : [...new Set([userDir, legacyDir])]

type Params = { params: Promise<{ id: string }> }
type Kind = "soundFolders" | "soundHotkeys"
type Preferences = SoundFolder[] | SoundHotkey[]
type Result = { value: Preferences; stored: boolean }

// Serializa alteracoes da mesma campanha dentro de uma instancia Next.js.
const queues = new Map<string, Promise<void>>()

async function authorized(params: Params["params"]) {
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

function normalize(kind: Kind, value: unknown): Preferences {
  return kind === "soundFolders" ? normalizeSoundFolders(value) : normalizeSoundHotkeys(value)
}

function matches(kind: Kind, left: unknown, right: unknown): boolean {
  return JSON.stringify(normalize(kind, left)) === JSON.stringify(normalize(kind, right))
}

function pathFor(dir: string, id: string, kind: Kind): string {
  // ID da URL nunca vira caminho diretamente.
  return join(dir, `${Buffer.from(id).toString("hex")}.${kind}.json`)
}

async function readFromDisk(id: string, kind: Kind): Promise<Result> {
  for (const dir of dirs) {
    try {
      const parsed: unknown = JSON.parse(await readFile(pathFor(dir, id, kind), "utf8"))
      if (!Array.isArray(parsed)) throw new Error(`Arquivo ${kind} inválido no servidor.`)
      return { value: normalize(kind, parsed), stored: true }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT" || (!configuredDir && ["EACCES", "EPERM", "EROFS", "ENOTDIR"].includes(code ?? ""))) continue
      throw error
    }
  }
  return { value: [], stored: false }
}

function readState(id: string, kind: Kind): Preferences | null {
  const data: unknown = Reflect.get(getCampaignState(id), kind)
  return Array.isArray(data) ? normalize(kind, data) : null
}

async function readPreference(id: string, kind: Kind): Promise<Result> {
  if (stateFields.has(kind)) {
    const stateValue = readState(id, kind)
    if (stateValue !== null) return { value: stateValue, stored: true }
  }
  const file = await readFromDisk(id, kind)
  if (file.stored) return file
  // Compatibilidade com o estado legado (ainda que nao seja campo persistivel).
  return { value: readState(id, kind) ?? [], stored: false }
}

async function writeToDisk(id: string, kind: Kind, value: Preferences): Promise<void> {
  let lastError: unknown
  for (const dir of dirs) {
    let temp: string | undefined
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 })
      const destination = pathFor(dir, id, kind)
      temp = `${destination}.${randomUUID()}.tmp`
      await writeFile(temp, JSON.stringify(value), { encoding: "utf8", flag: "wx", mode: 0o600 })
      await rename(temp, destination)
      const persisted: unknown = JSON.parse(await readFile(destination, "utf8"))
      if (!matches(kind, persisted, value)) {
        const error = new Error("Não foi possível confirmar os dados gravados.") as NodeJS.ErrnoException
        error.code = "EVERIFY"
        throw error
      }
      return
    } catch (error) {
      lastError = error
      const code = (error as NodeJS.ErrnoException).code
      if (configuredDir || !["EACCES", "EPERM", "EROFS", "ENOTDIR", "ENOENT"].includes(code ?? "")) {
        throw error
      }
    } finally {
      if (temp) await rm(temp, { force: true }).catch(() => {})
    }
  }
  throw lastError ?? new Error("Nenhum diretório gravável disponível.")
}

async function savePreference(id: string, kind: Kind, value: Preferences): Promise<void> {
  if (stateFields.has(kind)) {
    // Usa o MESMO mecanismo persistente da rota /state (sem novo arquivo).
    // A tipagem do patch varia entre versoes de CampaignState; o campo foi
    // conferido contra CAMPAIGN_STATE_ARRAY_FIELDS antes da chamada.
    const patch = { [kind]: value } as unknown as Parameters<typeof updateCampaignState>[1]
    await updateCampaignState(id, patch)
    const confirmed = readState(id, kind)
    if (confirmed === null || !matches(kind, confirmed, value)) {
      const error = new Error(`O estado da campanha não confirmou ${kind}.`) as NodeJS.ErrnoException
      error.code = "EVERIFY"
      throw error
    }
    return
  }
  await writeToDisk(id, kind, value)
}

function serialize(id: string, job: () => Promise<void>): Promise<void> {
  const previous = queues.get(id) ?? Promise.resolve()
  const current = previous.then(job)
  const settled = current.then(() => {}, () => {})
  queues.set(id, settled)
  void settled.then(() => { if (queues.get(id) === settled) queues.delete(id) })
  return current
}

function failure(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code ?? "EUNKNOWN"
  if (["EACCES", "EPERM", "EROFS"].includes(code)) return {
    code, status: 503,
    error: "O processo do Next.js não pode gravar as configurações. Configure SOUNDPAD_CONFIG_DIR com um diretório persistente gravável pelo usuário do servidor (ou habilite soundFolders/soundHotkeys no armazenamento de /state).",
  }
  if (["ENOSPC", "EDQUOT"].includes(code)) return {
    code, status: 507, error: "O armazenamento de configurações está sem espaço.",
  }
  if (code === "EVERIFY") return {
    code, status: 503, error: "Não foi possível confirmar a persistência dos dados no servidor.",
  }
  return { code, status: 500, error: "Falha ao salvar as preferências sonoras no servidor." }
}

export async function GET(_request: Request, { params }: Params) {
  const access = await authorized(params)
  if ("error" in access) return access.error
  try {
    const [folders, hotkeys] = await Promise.all([
      readPreference(access.id, "soundFolders"),
      readPreference(access.id, "soundHotkeys"),
    ])
    return NextResponse.json({
      success: true,
      soundFolders: folders.value, soundHotkeys: hotkeys.value,
      stored: { folders: folders.stored, hotkeys: hotkeys.stored },
      legacyIncluded: true,
    }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("[sound/preferences] GET:", error)
    return NextResponse.json({ error: "Não foi possível ler as preferências sonoras." }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: Params) {
  const access = await authorized(params)
  if ("error" in access) return access.error
  const length = Number(request.headers.get("content-length") ?? "0")
  if (length > MAX_BYTES) return NextResponse.json({ error: "Configuração grande demais." }, { status: 413 })
  const raw = await request.text().catch(() => "")
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) {
    return NextResponse.json({ error: "Configuração grande demais." }, { status: 413 })
  }
  let body: Record<string, unknown> | null = null
  try {
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === "object" && !Array.isArray(value)) body = value as Record<string, unknown>
  } catch { /* JSON inválido */ }
  const keys = body ? Object.keys(body) : []
  const kind: Kind | null = keys.length === 1 && (keys[0] === "soundFolders" || keys[0] === "soundHotkeys")
    ? keys[0] : null
  if (!kind || !Array.isArray(body?.[kind])) {
    return NextResponse.json({ error: "Envie apenas soundFolders ou soundHotkeys como uma lista." }, { status: 400 })
  }
  const normalized = normalize(kind, body[kind])
  try {
    await serialize(access.id, () => savePreference(access.id, kind, normalized))
    return NextResponse.json({ success: true, [kind]: normalized }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    const info = failure(error)
    console.error("[sound/preferences] POST:", { campaignId: access.id, kind, code: info.code, error })
    return NextResponse.json({ success: false, error: info.error, code: info.code }, {
      status: info.status, headers: { "Cache-Control": "private, no-store" },
    })
  }
}
