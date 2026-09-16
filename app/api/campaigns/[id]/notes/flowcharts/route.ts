import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { genId, getMemberRole, saveToDisk, store } from "@/lib/store"
import type { FlowchartEdge, FlowchartNode, PersonalFlowchart } from "@/lib/types"

async function getAccess(params: Promise<{ id: string }>) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }
  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }
  if (!getMemberRole(campaign, user.id)) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }
  return { campaignId, user }
}

function recordKey(campaignId: string, userId: string) {
  return `${campaignId}:${userId}`
}

function getFlowcharts(key: string): PersonalFlowchart[] {
  return store.personalNotes.get(key)?.flowcharts || []
}

function saveFlowcharts(key: string, flowcharts: PersonalFlowchart[]) {
  const current = store.personalNotes.get(key)
  store.personalNotes.set(key, {
    notes: current?.notes || [],
    flowcharts,
    updatedAt: Math.max(Date.now(), Number(current?.updatedAt || 0) + 1),
  })
  saveToDisk(store)
}

function cleanNodes(value: unknown): FlowchartNode[] | null {
  if (!Array.isArray(value) || value.length > 120) return null
  const colors = new Set(["bronze", "blue", "green", "red", "purple"])
  const nodes: FlowchartNode[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null
    const node = raw as Record<string, unknown>
    const id = String(node.id || "").slice(0, 100)
    if (!id || nodes.some((entry) => entry.id === id)) return null
    nodes.push({
      id,
      text: String(node.text || "").slice(0, 500),
      x: Math.max(0, Math.min(1480, Number(node.x) || 0)),
      y: Math.max(0, Math.min(920, Number(node.y) || 0)),
      color: colors.has(String(node.color)) ? (node.color as FlowchartNode["color"]) : "bronze",
    })
  }
  return nodes
}

function cleanEdges(value: unknown, nodes: FlowchartNode[]): FlowchartEdge[] | null {
  if (!Array.isArray(value) || value.length > 240) return null
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges: FlowchartEdge[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null
    const edge = raw as Record<string, unknown>
    const id = String(edge.id || "").slice(0, 100)
    const from = String(edge.from || "").slice(0, 100)
    const to = String(edge.to || "").slice(0, 100)
    if (!id || from === to || !nodeIds.has(from) || !nodeIds.has(to)) continue
    if (!edges.some((entry) => entry.from === from && entry.to === to)) edges.push({ id, from, to })
  }
  return edges
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if ("error" in access) return access.error
  return NextResponse.json({ flowcharts: getFlowcharts(recordKey(access.campaignId, access.user.id)) })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if ("error" in access) return access.error
  const key = recordKey(access.campaignId, access.user.id)
  const flowcharts = getFlowcharts(key)
  if (flowcharts.length >= 20) return NextResponse.json({ error: "Limite de fluxogramas atingido." }, { status: 400 })
  const body = await request.json().catch(() => null)
  const now = Date.now()
  const flowchart: PersonalFlowchart = {
    id: genId("flowchart"),
    title: String(body?.title || "Novo fluxograma").trim().slice(0, 120) || "Novo fluxograma",
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
  }
  saveFlowcharts(key, [flowchart, ...flowcharts])
  return NextResponse.json({ flowchart }, { status: 201 })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if ("error" in access) return access.error
  const key = recordKey(access.campaignId, access.user.id)
  const flowcharts = getFlowcharts(key)
  const body = await request.json().catch(() => null)
  const current = flowcharts.find((flowchart) => flowchart.id === String(body?.id || ""))
  if (!current) return NextResponse.json({ error: "Fluxograma não encontrado." }, { status: 404 })
  const nodes = cleanNodes(body?.nodes)
  if (!nodes) return NextResponse.json({ error: "Blocos inválidos." }, { status: 400 })
  const edges = cleanEdges(body?.edges, nodes)
  if (!edges) return NextResponse.json({ error: "Conexões inválidas." }, { status: 400 })
  const flowchart: PersonalFlowchart = {
    ...current,
    title: String(body?.title ?? current.title).trim().slice(0, 120) || "Sem título",
    nodes,
    edges,
    updatedAt: Math.max(Date.now(), current.updatedAt + 1),
  }
  saveFlowcharts(key, flowcharts.map((entry) => entry.id === flowchart.id ? flowchart : entry))
  return NextResponse.json({ flowchart })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if ("error" in access) return access.error
  const key = recordKey(access.campaignId, access.user.id)
  const flowcharts = getFlowcharts(key)
  const body = await request.json().catch(() => null)
  const id = String(body?.id || "")
  if (!flowcharts.some((flowchart) => flowchart.id === id)) return NextResponse.json({ error: "Fluxograma não encontrado." }, { status: 404 })
  saveFlowcharts(key, flowcharts.filter((flowchart) => flowchart.id !== id))
  return NextResponse.json({ success: true })
}
