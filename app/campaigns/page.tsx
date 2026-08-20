import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { CampaignsDashboard } from "@/components/campaigns-dashboard"

export default async function CampaignsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  return (
    <main className="rpg-page min-h-dvh">
      <CampaignsDashboard userName={user.name} />
    </main>
  )
}
