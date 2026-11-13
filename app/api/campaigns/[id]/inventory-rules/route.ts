import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store, transactStore, publish } from "@/lib/store"
import { readCampaignInventoryRules, validateCampaignInventoryRules } from "@/lib/inventory-weight"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const json = (body: unknown, status = 200) => NextResponse.json(body,
  { status, headers: { "Cache-Control": "private, no-store" } })
type Context = {params: Promise<{id: string}>}
async function access(params: Context["params"]) {
  const user = await getCurrentUser()
  if (!user) return {error: json({error:"Não autenticado."},401)}
  const {id} = await params
  const campaign = store.campaigns.get(id)
  if (!campaign) return {error: json({error:"Campanha não encontrada."},404)}
  const role = getMemberRole(campaign,user.id)
  if (!role) return {error: json({error:"Sem acesso à campanha."},403)}
  return {id,role}
}
export async function GET(_request: Request, {params}: Context) {
  const auth = await access(params)
  if ("error" in auth) return auth.error
  return json({settings: readCampaignInventoryRules(store.campaignState.get(auth.id)?.inventoryRules)})
}
export async function PUT(request: Request, {params}: Context) {
  const auth = await access(params)
  if ("error" in auth) return auth.error
  if (auth.role !== "gm") return json({error:"Somente o Mestre pode configurar estes limites."},403)
  const raw = await request.text().catch(()=>"")
  if (raw.length > 4096) return json({error:"Dados muito grandes."},413)
  let settings
  try {settings = validateCampaignInventoryRules(JSON.parse(raw).settings)}
  catch(error){return json({error:error instanceof Error ? error.message : "Dados inválidos."},400)}
  try {
    await transactStore(db => {
      const current = db.campaignState.get(auth.id) || {}
      db.campaignState.set(auth.id,{...current,inventoryRules:settings})
      return {value: true,changed:true}
    })
    publish(auth.id,{type:"campaign:inventory-rules:updated"} as any)
    return json({settings})
  } catch(error) {
    console.error("[INVENTORY_RULES_PUT]",error)
    return json({error:"Não foi possível gravar as regras."},500)
  }
}
