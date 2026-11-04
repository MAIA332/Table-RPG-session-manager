/**
 * Configuração persistente do Soundpad, independente dos campos de /state.
 * Em Docker, configure SOUNDPAD_CONFIG_DIR para um diretório em volume persistente.
 */
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store } from "@/lib/store"
import {
  normalizeSoundFolders, normalizeSoundHotkeys,
  type SoundFolder, type SoundHotkey,
} from "@/lib/sound-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const maxPayloadBytes = 1024 * 1024
const directory = process.env.SOUNDPAD_CONFIG_DIR || join(process.cwd(), ".soundpad-data")

type Params = { params: Promise<{ id: string }> }
type Kind = "soundFolders" | "soundHotkeys"

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

function filePath(campaignId: string, kind: Kind): string {
  // Nunca usar um ID de URL diretamente como componente de caminho.
  const safeId = Buffer.from(campaignId).toString("hex")
  return join(directory, `${safeId}.${kind}.json`)
}

async function readPreference(kind: "soundFolders", id: string): Promise<SoundFolder[] | null>
async function readPreference(kind: "soundHotkeys", id: string): Promise<SoundHotkey[] | null>
async function readPreference(kind: Kind, id: string): Promise<SoundFolder[] | SoundHotkey[] | null> {
  try {
    const content = await readFile(filePath(id, kind), "utf8")
    const parsed: unknown = JSON.parse(content)
    return kind === "soundFolders" ? normalizeSoundFolders(parsed) : normalizeSoundHotkeys(parsed)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

async function writePreference(id: string, kind: Kind, value: SoundFolder[] | SoundHotkey[]): Promise<void> {
  await mkdir(directory, { recursive: true })
  const destination = filePath(id, kind)
  const temporary = `${destination}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600, flag: "wx" })
    await rename(temporary, destination)
  } finally {
    await unlink(temporary).catch(() => { })
  }
}

export async function GET(_request: Request, { params }: Params) {
  const access = await authorized(params)
  if ("error" in access) return access.error
  try {
    const [soundFolders, soundHotkeys] = await Promise.all([
      readPreference("soundFolders", access.id), readPreference("soundHotkeys", access.id),
    ])
    return NextResponse.json({
      success: true, soundFolders: soundFolders ?? [], soundHotkeys: soundHotkeys ?? [],
      stored: { folders: soundFolders !== null, hotkeys: soundHotkeys !== null },
    }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("Falha ao ler preferências sonoras:", error)
    return NextResponse.json({ error: "Não foi possível ler a configuração do Soundpad." }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: Params) {
  const access = await authorized(params)
  if ("error" in access) return access.error
  const contentLength = Number(request.headers.get("content-length") || "0")
  if (contentLength > maxPayloadBytes) return NextResponse.json({ error: "Configuração grande demais." }, { status: 413 })
  const raw = await request.text().catch(() => "")
  if (Buffer.byteLength(raw, "utf8") > maxPayloadBytes) {
    return NextResponse.json({ error: "Configuração grande demais." }, { status: 413 })
  }
  let body: Record<string, unknown> | null = null
  try {
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === "object" && !Array.isArray(value)) body = value as Record<string, unknown>
  } catch { /* JSON inválido */ }
  const kind: Kind | null = body && typeof body === "object" && Object.keys(body).length === 1
    ? (Array.isArray(body.soundFolders) ? "soundFolders" : Array.isArray(body.soundHotkeys) ? "soundHotkeys" : null)
    : null
  if (!kind) return NextResponse.json({ error: "Envie soundFolders ou soundHotkeys como uma lista." }, { status: 400 })
  if (JSON.stringify(body).length > maxPayloadBytes) {
    return NextResponse.json({ error: "Configuração grande demais." }, { status: 413 })
  }
  if (body) {
    const normalized = kind === "soundFolders" ? normalizeSoundFolders(body.soundFolders) : normalizeSoundHotkeys(body.soundHotkeys)
    try {
      await writePreference(access.id, kind, normalized)
      return NextResponse.json({ success: true, [kind]: normalized }, { headers: { "Cache-Control": "private, no-store" } })
    } catch (error) {
      console.error("Falha ao persistir preferências sonoras:", error)
      return NextResponse.json({ error: "Não foi possível salvar no servidor. Verifique SOUNDPAD_CONFIG_DIR e as permissões de escrita." }, { status: 500 })
    }
  }
}
