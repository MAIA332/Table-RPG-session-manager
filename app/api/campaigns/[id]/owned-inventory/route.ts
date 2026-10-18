import "server-only"

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store } from "@/lib/store"
import { getMongoDb } from "@/lib/mongodb"

export const dynamic = "force-dynamic"

// Usamos a mesma colecao que lib/store.ts utiliza em persistSnapshot().
// Um GET do snapshot em memoria pode estar desatualizado em outros workers Next.js.
const collectionName = () => process.env.MONGODB_COLLECTION?.trim() || "vtt_store"
const privateNoStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" }

type StoredCharacter = {
    id: string
    ownerId: string
    campaignId: string
    equipment?: unknown
    customItems?: unknown
    updatedAt?: unknown
}

type StoredDocument = {
    _id: string
    collection: string
    key: string
    value?: StoredCharacter
}

/**
 * Retorna somente as mochilas dos personagens do usuário; o GM pode ver
 * todas as mochilas da propria campanha. A fonte autoritativa e o MongoDB.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const user = await getCurrentUser()
    if (!user)
        return NextResponse.json({ error: "Não autenticado." }, { status: 401, headers: privateNoStore })

    const { id: campaignId } = await params
    const campaign = store.campaigns.get(campaignId)
    if (!campaign)
        return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404, headers: privateNoStore })

    const role = getMemberRole(campaign, user.id)
    if (!role)
        return NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403, headers: privateNoStore })

    try {
        const db = await getMongoDb()
        const collection = db.collection<StoredDocument>(collectionName())
        const documents = await collection.find({
            collection: "characters",
            "value.campaignId": campaignId,
            ...(role === "gm" ? {} : { "value.ownerId": user.id }),
        }).toArray()

        // A filtragem em dois niveis protege o retorno mesmo se algum registro
        // legado contiver metadados inconsistentes.
        const stateDocument = await collection.findOne({ _id: `campaignState:${campaignId}` })
        const state = stateDocument?.collection === "campaignState"
            ? stateDocument.value as unknown as Record<string, unknown> | undefined
            : undefined
        const customEquipment = Array.isArray(state?.customEquipment) ? state.customEquipment : []

        const characters = documents.flatMap((document) => {
            const c = document.value
            if (
                document.collection !== "characters" ||
                !c ||
                c.id !== document.key ||
                c.campaignId !== campaignId ||
                (role !== "gm" && c.ownerId !== user.id)
            ) return []
            return [{
                id: c.id,
                equipment: Array.isArray(c.equipment) ? c.equipment.filter((id): id is string => typeof id === "string") : [],
                customItems: Array.isArray(c.customItems) ? c.customItems : [],
                updatedAt: Number(c.updatedAt) || 0,
            }]
        })

        return NextResponse.json({ characters, customEquipment }, { headers: privateNoStore })
    } catch (error) {
        console.error("[owned-inventory] Falha ao consultar MongoDB", error)
        return NextResponse.json(
            { error: "Falha ao consultar a mochila persistida. Tente novamente." },
            { status: 503, headers: privateNoStore },
        )
    }
}
