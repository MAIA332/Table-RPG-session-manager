import { redirect, notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { getCampaignCharacters, getMemberRole, store } from "@/lib/store"
import { CampaignRoom } from "@/components/campaign-room"

export default async function CampaignRoomPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const { id } = await params
  const campaign = store.campaigns.get(id)
  if (!campaign) notFound()

  const role = getMemberRole(campaign, user.id)
  if (!role) redirect("/campaigns")

  const members = campaign.members.map((m) => {
    const u = store.users.get(m.userId)
    return { userId: m.userId, role: m.role, name: u?.name ?? "Desconhecido" }
  })

  const initial = {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      code: campaign.code,
      ownerId: campaign.ownerId,
    },
    role,
    members,
    characters: getCampaignCharacters(id),
    me: { id: user.id, name: user.name },
  }

  return <CampaignRoom initial={initial} />
}
