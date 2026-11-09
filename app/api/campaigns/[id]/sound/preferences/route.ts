/**
 * Preferências do estúdio: MongoDB é a única fonte de verdade.
 *
 * NÃO persistir novas preferências em diretórios locais (.soundpad-data,
 * ~/.local/share, SOUNDPAD_CONFIG_DIR), que podem desaparecer num redeploy.
 * Os arquivos antigos servem APENAS para uma migração única quando ainda
 * não existe o registro desta campanha no MongoDB.
 *
 * Uma coleção exclusiva impede que um POST /state feito por outra tela da
 * campanha sobrescreva pastas, playlists ou atalhos. Revisões independentes
 * e compare-and-swap evitam perder alterações de abas/instâncias concorrentes.
 */
import { readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store } from "@/lib/store"
import { getMongoDb } from "@/lib/mongodb"
import {
  normalizeSoundFolders, normalizeSoundHotkeys,
  type SoundFolder, type SoundHotkey,
} from "@/lib/sound-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BYTES = 1024 * 1024
const COLLECTION = "vtt_sound_preferences"
type Params = { params: Promise<{ id: string }> }
type Kind = "soundFolders" | "soundHotkeys"
type Preferences = SoundFolder[] | SoundHotkey[]
type Revisions = Record<Kind, number>

type SoundPreferencesDocument = {
  _id: string
  soundFolders?: SoundFolder[]
  soundHotkeys?: SoundHotkey[]
  folderRevision: number
  hotkeyRevision: number
  createdAt?: number
  updatedAt?: number
}

const revisionField: Record<Kind, "folderRevision" | "hotkeyRevision"> = {
  soundFolders: "folderRevision", soundHotkeys: "hotkeyRevision",
}

class RevisionConflict extends Error {}

async function authorized(params: Params["params"]) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }
  const { id } = await params
  const campaign = store.campaigns.get(id)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }
  if (getMemberRole(campaign, user.id) !== "gm") {
    return { error: NextResponse.json({ error: "Apenas o Mestre pode configurar os áudios." }, { status: 403 }) }
  }
  return { id }
}

function normalize(kind: Kind, value: unknown): Preferences {
  return kind === "soundFolders" ? normalizeSoundFolders(value) : normalizeSoundHotkeys(value)
}
function same(kind: Kind, a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(kind, a)) === JSON.stringify(normalize(kind, b))
}
function getRevisions(record: SoundPreferencesDocument | null): Revisions {
  const revision = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
  return { soundFolders: revision(record?.folderRevision), soundHotkeys: revision(record?.hotkeyRevision) }
}
function responseData(record: SoundPreferencesDocument | null) {
  return {
    success: true,
    soundFolders: normalizeSoundFolders(record?.soundFolders),
    soundHotkeys: normalizeSoundHotkeys(record?.soundHotkeys),
    stored: { folders: Array.isArray(record?.soundFolders), hotkeys: Array.isArray(record?.soundHotkeys) },
    revisions: getRevisions(record),
    legacyIncluded: true, // Compatibilidade com clientes que já esperam este sinal.
    source: "mongodb",
  }
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
}
async function collection() {
  const db = await getMongoDb()
  return db.collection<SoundPreferencesDocument>(COLLECTION)
}

// Apenas LEITURA de arquivos deixados pela rota antiga; nenhum write aqui.
const configuredDir = process.env.SOUNDPAD_CONFIG_DIR?.trim()
const legacyDirs = [...new Set([
  ...(configuredDir ? [resolve(configuredDir)] : []),
  resolve(homedir(), ".local", "share", "rpg-soundpad"),
  resolve(process.cwd(), ".soundpad-data"),
])]

async function legacyFile(campaignId: string, kind: Kind): Promise<Preferences | null> {
  for (const dir of legacyDirs) {
    const file = join(dir, `${Buffer.from(campaignId).toString("hex")}.${kind}.json`)
    try {
      if ((await stat(file)).size > MAX_BYTES) {
        console.warn("[sound/preferences] Arquivo legado excede o limite e não será migrado.", { campaignId, kind })
        continue
      }
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"))
      if (Array.isArray(parsed)) return normalize(kind, parsed)
      console.warn("[sound/preferences] Arquivo legado inválido.", { campaignId, kind })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[sound/preferences] Não foi possível ler arquivo legado.", { campaignId, kind, error })
      }
    }
  }
  return null
}

/**
 * Não sobrescreve NUNCA um documento Mongo existente, mesmo que nele existam
 * listas vazias. Em um deploy anterior o dado talvez estivesse em /state ou
 * em arquivo; migra esses dados apenas se o documento ainda não existe.
 */
async function getOrMigrate(campaignId: string): Promise<SoundPreferencesDocument | null> {
  const col = await collection()
  const existing = await col.findOne({ _id: campaignId })
  if (existing) return existing

  const [diskFolders, diskHotkeys] = await Promise.all([
    legacyFile(campaignId, "soundFolders"), legacyFile(campaignId, "soundHotkeys"),
  ])
  const state = store.campaignState.get(campaignId)
  const stateFolders = Array.isArray(state?.soundFolders) ? normalizeSoundFolders(state.soundFolders) : null
  const stateHotkeys = Array.isArray(state?.soundHotkeys) ? normalizeSoundHotkeys(state.soundHotkeys) : null
  const folders = diskFolders ?? stateFolders
  const hotkeys = diskHotkeys ?? stateHotkeys
  if (folders === null && hotkeys === null) return null

  const migrated: SoundPreferencesDocument = {
    _id: campaignId,
    folderRevision: folders !== null ? 1 : 0,
    hotkeyRevision: hotkeys !== null ? 1 : 0,
    ...(folders !== null ? { soundFolders: folders as SoundFolder[] } : {}),
    ...(hotkeys !== null ? { soundHotkeys: hotkeys as SoundHotkey[] } : {}),
    createdAt: Date.now(), updatedAt: Date.now(),
  }
  // Um POST ou outra instância pode ter criado o documento entre o GET e a
  // migração. $setOnInsert garante que o dado mais recente sempre prevaleça.
  await col.updateOne({ _id: campaignId }, { $setOnInsert: migrated }, { upsert: true })
  return col.findOne({ _id: campaignId })
}

export async function GET(_request: Request, { params }: Params) {
  const access = await authorized(params)
  if ("error" in access) return access.error
  try {
    const record = await getOrMigrate(access.id)
    return json(responseData(record))
  } catch (error) {
    console.error("[sound/preferences] MongoDB GET falhou:", error)
    return json({ success: false, error: "Não foi possível consultar as preferências no MongoDB. Nenhum dado local foi usado como confirmação." }, 503)
  }
}

export async function POST(request: Request, { params }: Params) {
  const access = await authorized(params)
  if ("error" in access) return access.error
  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > MAX_BYTES) return json({ error: "Configuração grande demais." }, 413)
  const raw = await request.text().catch(() => "")
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) return json({ error: "Configuração grande demais." }, 413)

  let body: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
  } catch {}
  const keys = body ? Object.keys(body) : []
  const kind = (keys.includes("soundFolders") ? "soundFolders" : keys.includes("soundHotkeys") ? "soundHotkeys" : null) as Kind | null
  if (!kind || keys.length !== 2 || !keys.includes("expectedRevision") || !Array.isArray(body?.[kind])) {
    return json({ error: "Envie uma lista soundFolders ou soundHotkeys e expectedRevision. Atualize a página para usar a versão nova do Soundpad." }, 400)
  }
  const expectedRevision = body?.expectedRevision
  if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 0) {
    return json({ error: "Revisão inválida. Recarregue a biblioteca sonora." }, 400)
  }
  const normalized = normalize(kind, body![kind])

  try {
    const col = await collection()
    let current = await getOrMigrate(access.id)
    if (!current) {
      // Cria apenas os metadados. Campos não informados continuam ausentes.
      await col.updateOne({ _id: access.id }, { $setOnInsert: {
        _id: access.id, folderRevision: 0, hotkeyRevision: 0, createdAt: Date.now(),
      } }, { upsert: true })
      current = await col.findOne({ _id: access.id })
    }
    if (!current) throw new Error("Não foi possível inicializar as preferências.")
    const revision = getRevisions(current)[kind]

    // Reenvio idempotente de uma gravação que foi concluída mas cuja resposta
    // caiu na rede. A confirmação sempre usa os dados atuais do banco.
    if (Array.isArray(current[kind]) && same(kind, current[kind], normalized)) {
      return json({ ...responseData(current), revision })
    }
    if (revision !== expectedRevision) throw new RevisionConflict("As preferências mudaram em outra aba ou instância. Recarregue antes de sobrescrever.")

    const updated = await col.findOneAndUpdate(
      { _id: access.id, [revisionField[kind]]: expectedRevision },
      { $set: { [kind]: normalized, updatedAt: Date.now() }, $inc: { [revisionField[kind]]: 1 } },
      { returnDocument: "after" },
    )
    if (!updated) throw new RevisionConflict("Outra sessão modificou as preferências. Recarregue para evitar perda de dados.")
    if (!same(kind, updated[kind], normalized)) throw new Error("O MongoDB não confirmou os dados gravados.")
    return json({ ...responseData(updated), revision: getRevisions(updated)[kind] })
  } catch (error) {
    if (error instanceof RevisionConflict) {
      return json({ success: false, code: "CONFLICT", error: error.message }, 409)
    }
    console.error("[sound/preferences] MongoDB POST falhou:", { campaignId: access.id, kind, error })
    return json({ success: false, error: "Falha ao salvar preferências no MongoDB. A alteração não foi confirmada; ela permanece no backup do navegador.", code: "MONGO_UNAVAILABLE" }, 503)
  }
}
