import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getCombat, commandCombat } from "@/lib/combat-server"
import { combatHttpError, readCombatBody } from "@/lib/combat-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 1. Definimos os Headers de CORS que permitem a requisição passar
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Em produção, considere trocar '*' pelo seu domínio (ex: "https://app-mortemagica.sinapselabs.com.br")
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-requested-with",
}

// 2. Método OPTIONS para responder ao "Preflight" do navegador
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser()
    console.log("📍 [COMBAT POST] Usuário:", user?.id);
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401, headers: corsHeaders })
    }
    const { id } = await params
    return NextResponse.json(
      { combat: getCombat(id, user.id) },
      { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return combatHttpError(error) 
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser()
    console.log("📍 [COMBAT POST] Usuário:", user?.id);
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401, headers: corsHeaders })
    }
    const { id } = await params
    const body = await readCombatBody(request)
    console.log("📍 [COMBAT POST] Body lido:", body.type);
    
    return NextResponse.json(
      { combat: commandCombat(id, user.id, body) },
      { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return combatHttpError(error)
  }
}