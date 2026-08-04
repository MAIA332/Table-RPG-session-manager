// app/api/campaigns/[id]/sound/route.ts
import { NextResponse } from "next/server";
import { publish } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const campaignId = resolvedParams.id;
    const body = await req.json();

    if (body.action === "play") {
      publish(campaignId, { 
         type: "sound:play", 
         sound: { id: body.id, trackId: body.trackId, url: body.url, loop: body.loop } 
      } as any);
      return NextResponse.json({ success: true });
    }

    if (body.action === "stop") {
      publish(campaignId, { type: "sound:stop", soundId: body.id } as any);
      return NextResponse.json({ success: true });
    }

    if (body.action === "stop_all") {
      publish(campaignId, { type: "sound:stop_all" } as any);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ação de som inválida" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}