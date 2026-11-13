"use client"
import useSWR from "swr"
import { DEFAULT_CAMPAIGN_INVENTORY_RULES, readCampaignInventoryRules,
  type CampaignInventoryRules } from "@/lib/inventory-weight"

const fetcher = async (url: string): Promise<{settings: CampaignInventoryRules}> => {
  const response = await fetch(url,{cache:"no-store"})
  const body = await response.json().catch(()=>({}))
  if (!response.ok) throw new Error(body.error || "Não foi possível consultar as regras da mochila.")
  return {settings: readCampaignInventoryRules(body.settings)}
}
export function useCampaignInventoryRules(campaignId: string) {
  const key = campaignId ? `/api/campaigns/${encodeURIComponent(campaignId)}/inventory-rules` : null
  const result = useSWR<{settings: CampaignInventoryRules}>(key,fetcher,
    {refreshInterval:15000,revalidateOnFocus:true,dedupingInterval:5000})
  return { rules:result.data?.settings || DEFAULT_CAMPAIGN_INVENTORY_RULES,
    loading: !result.data && !result.error, error:result.error, refresh:result.mutate }
}
