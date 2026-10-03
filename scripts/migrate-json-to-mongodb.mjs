import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { MongoClient } from "mongodb"


const ROOT = process.cwd()

const ENV_FILE = path.join(ROOT, ".env")

try {
  process.loadEnvFile(ENV_FILE)
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}
const JSON_DB = process.env.VTT_DB_FILE
  ? path.resolve(process.env.VTT_DB_FILE)
  : path.join(ROOT, "vtt-database.json")
const USERS_FILE = path.join(ROOT, "users.json")
const GALLERY_DIR = path.join(ROOT, "data")
const MONGO_URI = process.env.MONGODB_URI?.trim()
const MONGO_DB = process.env.MONGODB_DB?.trim()
const MONGO_COLLECTION = process.env.MONGODB_COLLECTION?.trim() || "vtt_store"

const persistedCollections = [
  "users",
  "sessions",
  "campaigns",
  "characters",
  "characterTombstones",
  "maps",
  "lore",
  "combatSessions",
  "campaignState",
  "personalNotes",
]

if (!MONGO_URI || !MONGO_DB) {
  throw new Error("Configure MONGODB_URI e MONGODB_DB antes da migração.")
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf8")
  return JSON.parse(content)
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function documentId(collection, key) {
  return `${collection}:${key}`
}

function addEntry(target, collection, key, value) {
  if (!persistedCollections.includes(collection)) return
  if (typeof key !== "string" || !key) return
  target.set(documentId(collection, key), {
    _id: documentId(collection, key),
    collection,
    key,
    value,
  })
}

const documents = new Map()

if (await exists(JSON_DB)) {
  const database = await readJson(JSON_DB)
  for (const collection of persistedCollections) {
    const entries = database?.[collection]
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) continue
      addEntry(documents, collection, String(entry[0]), entry[1])
    }
  }
  console.log(`[migração] Fonte principal encontrada: ${JSON_DB}`)
} else {
  console.log(`[migração] ${JSON_DB} não existe; continuando com as demais fontes.`)
}

if (await exists(USERS_FILE)) {
  const users = await readJson(USERS_FILE)
  if (Array.isArray(users)) {
    for (const user of users) {
      if (!user || typeof user !== "object" || typeof user.id !== "string") continue
      const id = documentId("users", user.id)
      if (!documents.has(id)) addEntry(documents, "users", user.id, user)
    }
  }
  console.log(`[migração] Usuários legados encontrados: ${USERS_FILE}`)
}

if (await exists(GALLERY_DIR)) {
  const files = await fs.readdir(GALLERY_DIR)
  for (const file of files) {
    const match = /^gallery_(.+)\.json$/i.exec(file)
    if (!match) continue
    const campaignId = match[1]
    const filePath = path.join(GALLERY_DIR, file)
    try {
      const gallery = await readJson(filePath)
      if (!Array.isArray(gallery)) continue

      const stateId = documentId("campaignState", campaignId)
      const current = documents.get(stateId)
      const currentState = current?.value && typeof current.value === "object"
        ? current.value
        : {}

      if (!Object.prototype.hasOwnProperty.call(currentState, "gallery")) {
        addEntry(documents, "campaignState", campaignId, {
          ...currentState,
          gallery,
          updatedAt: Number(currentState.updatedAt) || Date.now(),
        })
      }
    } catch (error) {
      console.warn(`[migração] Não foi possível importar ${file}:`, error?.message || error)
    }
  }
}

if (!documents.size) {
  console.log("[migração] Nenhum dado legado encontrado. Nenhuma escrita foi feita.")
  process.exit(0)
}

const client = new MongoClient(MONGO_URI, {
  appName: "morte-magica-migration",
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
  ignoreUndefined: true,
})

try {
  await client.connect()
  const db = client.db(MONGO_DB)
  const collection = db.collection(MONGO_COLLECTION)

  await collection.createIndex(
    { collection: 1, key: 1 },
    { unique: true, name: "store_collection_key_unique" },
  )

  const operations = [...documents.values()].map((doc) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: doc },
      upsert: true,
    },
  }))

  await collection.bulkWrite(operations, { ordered: false })
  console.log(`[migração] ${documents.size} registros importados/atualizados em '${MONGO_DB}.${MONGO_COLLECTION}'.`)
  console.log("[migração] Os arquivos JSON não foram removidos; mantenha-os como backup até validar a aplicação.")
} finally {
  await client.close().catch(() => undefined)
}
