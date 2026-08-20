// app/api/campaigns/[id]/leave/route.ts
import { NextResponse } from "next/server"
import { deleteCharacterFromStore, saveToDisk, store } from "@/lib/store"
import { getCurrentUser } from "@/lib/auth"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const { id } = await params
  const campaign = store.campaigns.get(id)
  
  if (!campaign) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 })
  }

  // Verifica se o usuário é o dono (Mestre)
  if (campaign.ownerId === user.id) {
    // Se o Mestre sai, a campanha é inteiramente deletada
    store.campaigns.delete(id)
    
    // (Opcional) Limpa os personagens associados a essa campanha para não pesar a memória
    for (const [charId, char] of store.characters.entries()) {
      if (char.campaignId === id) {
        deleteCharacterFromStore(charId)
      }
    }
  } else {
    // Se for apenas um jogador, remove o usuário da lista de membros
    campaign.members = campaign.members.filter((m) => m.userId !== user.id)
    
    // Deleta os personagens desse jogador nesta campanha
    for (const [charId, char] of store.characters.entries()) {
      if (char.campaignId === id && char.ownerId === user.id) {
        deleteCharacterFromStore(charId)
      }
    }
  }

  saveToDisk(store)
  return NextResponse.json({ success: true })
}
