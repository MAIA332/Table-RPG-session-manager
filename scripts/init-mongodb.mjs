import path from "node:path"
import process from "node:process"
import { MongoClient } from "mongodb"

const ROOT = process.cwd()

// Quando o script é executado diretamente com Node,
// o arquivo .env precisa ser carregado explicitamente.
try {
  process.loadEnvFile(path.join(ROOT, ".env"))
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error
  }
}

const uri = process.env.MONGODB_URI?.trim()
const databaseName = process.env.MONGODB_DB?.trim()
const collectionName =
  process.env.MONGODB_COLLECTION?.trim() || "vtt_store"

if (!uri || !databaseName) {
  throw new Error(
    "Configure MONGODB_URI e MONGODB_DB antes de iniciar a aplicação.",
  )
}

const client = new MongoClient(uri, {
  appName: "morte-magica",
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
})

try {
  await client.connect()

  const db = client.db(databaseName)
  const collection = db.collection(collectionName)

  await collection.createIndex(
    { collection: 1, key: 1 },
    {
      unique: true,
      name: "store_collection_key_unique",
    },
  )

  await collection.createIndex(
    { collection: 1 },
    {
      name: "store_collection",
    },
  )

  console.log(
    `[MongoDB] Banco '${databaseName}' pronto; coleção '${collectionName}'.`,
  )
} finally {
  await client.close().catch(() => undefined)
}