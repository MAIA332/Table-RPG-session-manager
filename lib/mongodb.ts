import "server-only"
import { MongoClient, type Db } from "mongodb"

const mongoGlobal = globalThis as typeof globalThis & {
  __vttMongoClient?: Promise<MongoClient>
}

export async function getMongoDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim()
  const database = process.env.MONGODB_DB?.trim()
  if (!uri || !database) {
    throw new Error("Configure MONGODB_URI e MONGODB_DB.")
  }

  if (!mongoGlobal.__vttMongoClient) {
    const client = new MongoClient(uri, {
      appName: "morte-magica",
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      maxPoolSize: 10,
      ignoreUndefined: true,
    })

    mongoGlobal.__vttMongoClient = client.connect().catch(async (error) => {
      mongoGlobal.__vttMongoClient = undefined
      await client.close().catch(() => undefined)
      throw error
    })
  }

  return (await mongoGlobal.__vttMongoClient).db(database)
}
