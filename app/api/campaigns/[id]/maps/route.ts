import { NextResponse } from "next/server";
import { store, publish } from "@/lib/store";

// Função para buscar mapas salvos quando a sala carrega
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 1. Resolve a promise obrigatória no Next.js 15+
    const resolvedParams = await params;
    const campaignId = resolvedParams.id;
    
    // 2. Trava de segurança (Hot Reload pode não ter o mapa ainda)
    if (!store.maps) store.maps = new Map();

    const maps = Array.from(store.maps.values()).filter(m => m.campaignId === campaignId);
    return NextResponse.json({ maps });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Função para criar, mover tokens ou pintar terreno
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 1. Resolve a promise obrigatória no Next.js 15+
    const resolvedParams = await params;
    const campaignId = resolvedParams.id;
    const body = await req.json();

    // 2. Trava de segurança contra o erro "Cannot read properties of undefined (reading 'set')"
    if (!store.maps) store.maps = new Map();

    if (body.action === "create") {
      const newMap = body.map;
      store.maps.set(newMap.id, newMap);
      publish(campaignId, { type: "map:created", map: newMap } as any);
      return NextResponse.json({ success: true, map: newMap });
    }

    if (body.action === "update_tokens") {
      const map = store.maps.get(body.mapId);
      if (!map) return NextResponse.json({ error: "Mapa não encontrado" }, { status: 404 });
      
      if (!map.tokens) map.tokens = {};
      map.tokens[body.tokenId] = { x: body.x, y: body.y, type: body.tokenType };
      
      publish(campaignId, { type: "map:token_moved", mapId: map.id, tokenId: body.tokenId, x: body.x, y: body.y, tokenType: body.tokenType } as any);
      return NextResponse.json({ success: true });
    }

    if (body.action === "update_terrain") {
      const map = store.maps.get(body.mapId);
      if (!map) return NextResponse.json({ error: "Mapa não encontrado" }, { status: 404 });
      
      map.tiles[`${body.tileData.x},${body.tileData.y}`] = body.tileData;
      publish(campaignId, { type: "map:terrain_updated", mapId: map.id, tileData: body.tileData } as any);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err: any) {
    console.error("Erro na API do mapa:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}