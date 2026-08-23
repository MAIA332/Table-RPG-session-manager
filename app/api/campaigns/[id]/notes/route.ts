import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { genId, getMemberRole, saveToDisk, store } from "@/lib/store"
import type { PersonalNote } from "@/lib/types"

async function getAccess(params: Promise<{ id: string }>) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }

  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }
  if (!getMemberRole(campaign, user.id)) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }

  return { campaignId, user }
}

function getRecordKey(campaignId: string, userId: string) {
  return `${campaignId}:${userId}`
}

function getNotes(key: string) {
  return store.personalNotes.get(key)?.notes || []
}

function saveNotes(key: string, notes: PersonalNote[]) {
  const current = store.personalNotes.get(key)
  const updatedAt = Math.max(Date.now(), Number(current?.updatedAt || 0) + 1)
  store.personalNotes.set(key, { notes, updatedAt })
  saveToDisk(store)
  return notes
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  const key = getRecordKey(access.campaignId, access.user.id)
  return NextResponse.json({ notes: getNotes(key) })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  const key = getRecordKey(access.campaignId, access.user.id)
  const notes = getNotes(key)
  if (notes.length >= 80) return NextResponse.json({ error: "Limite de anotações atingido." }, { status: 400 })

  const body = await request.json().catch(() => null)
  const now = Date.now()
  const note: PersonalNote = {
    id: genId("note"),
    title: String(body?.title || "Nova anotação").trim().slice(0, 120) || "Nova anotação",
    content: String(body?.content || "").slice(0, 30000),
    createdAt: now,
    updatedAt: now,
  }
  saveNotes(key, [note, ...notes])
  return NextResponse.json({ note }, { status: 201 })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  const key = getRecordKey(access.campaignId, access.user.id)
  const body = await request.json().catch(() => null)
  const id = String(body?.id || "")
  const notes = getNotes(key)
  const current = notes.find((note) => note.id === id)
  if (!current) return NextResponse.json({ error: "Anotação não encontrada." }, { status: 404 })

  const note: PersonalNote = {
    ...current,
    title: String(body?.title ?? current.title).trim().slice(0, 120) || "Sem título",
    content: String(body?.content ?? current.content).slice(0, 30000),
    updatedAt: Math.max(Date.now(), current.updatedAt + 1),
  }
  saveNotes(key, notes.map((entry) => entry.id === id ? note : entry))
  return NextResponse.json({ note })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  const key = getRecordKey(access.campaignId, access.user.id)
  const body = await request.json().catch(() => null)
  const id = String(body?.id || "")
  const notes = getNotes(key)
  if (!notes.some((note) => note.id === id)) return NextResponse.json({ error: "Anotação não encontrada." }, { status: 404 })

  saveNotes(key, notes.filter((note) => note.id !== id))
  return NextResponse.json({ success: true })
}
