import { NextResponse } from "next/server";
import { store, publish } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const characterId = resolvedParams.id;
    const body = await req.json();
    const targetUserId = body.userId;

    const character = store.characters.get(characterId);
    if (!character) {
      return NextResponse.json({ error: "Personagem não encontrado" }, { status: 404 });
    }

    // Altera a posse (owner) do personagem para o novo jogador
    character.ownerId = targetUserId;

    // Dispara via WebSocket/SSE para toda a sala para mover as cartinhas de lado
    publish(character.campaignId, { 
      type: "character:updated", 
      character 
    } as any);

    return NextResponse.json({ success: true, character });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}