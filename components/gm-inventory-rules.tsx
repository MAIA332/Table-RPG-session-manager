"use client"
import { useEffect, useState } from "react"
import { Save, Coins, Scale, AlertTriangle } from "lucide-react"
import { controllerConfirm } from "@/lib/input/dialogs"
import { useCampaignInventoryRules } from "@/lib/use-campaign-inventory-rules"
import { validateCampaignInventoryRules, zenitCapacity,
  type CampaignInventoryRules } from "@/lib/inventory-weight"

const fields: {key:keyof CampaignInventoryRules,label:string,min:number,max:number,unit:string}[] = [
  {key:"startingZenitLimit",label:"Limiar inicial de Zenits",min:0,max:100000000,unit:"z"},
  {key:"zenitPerUpgrade",label:"Zenits por evolução da mochila",min:0,max:100000000,unit:"z"},
  {key:"startingCapacityKg",label:"Capacidade inicial de referência",min:1,max:1000,unit:"kg"},
  {key:"capacityPerUpgradeKg",label:"Kg por evolução da mochila",min:1,max:1000,unit:"kg"},
  {key:"overloadPercent",label:"Limiar de sobrecarga física (mínimo 100%)",min:100,max:200,unit:"%"},
  {key:"dexPenalty",label:"Penalidade de DEX por Peso",min:0,max:100,unit:"pontos"},
]
export function GmInventoryRules({campaignId}: {campaignId:string}) {
  const {rules,loading,error:loadError,refresh}=useCampaignInventoryRules(campaignId)
  const [draft,setDraft]=useState(rules)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState("")
  const [success,setSuccess]=useState("")
  useEffect(()=>setDraft(rules),[rules])
  const save = async () => {
    if (saving) return
    setError("");setSuccess("")
    let settings: CampaignInventoryRules
    try { settings = validateCampaignInventoryRules(draft) }
    catch(reason) {setError(reason instanceof Error ? reason.message : "Valores inválidos.");return}
    if (!(await controllerConfirm("Aplicar as novas regras de mochila, Zenits e Peso para toda a campanha?"))) return
    setSaving(true)
    try {
      const response=await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/inventory-rules`,
        {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({settings})})
      const body=await response.json().catch(()=>({}))
      if (!response.ok) throw new Error(body.error||"Falha ao salvar.")
      await refresh()
      setSuccess("Regras salvas no servidor e aplicadas na campanha.")
    } catch(reason) {setError(reason instanceof Error ? reason.message : "Erro ao salvar.")}
    finally {setSaving(false)}
  }
  return <section className="space-y-3 rounded-xl border border-primary/30 bg-background/60 p-4" aria-label="Configurações de mochila e Zenits">
    <div className="flex items-start gap-3"><Scale className="mt-0.5 size-5 shrink-0 text-primary"/><div><h3 className="font-serif text-lg font-bold">Limites de mochila e carteira</h3>
      <p className="text-xs text-muted-foreground">Regras da campanha. Edite com o controle e confirme para aplicar em tempo real.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map(field=><label key={field.key} className="space-y-1 rounded-lg border border-border/60 bg-card/30 p-2.5">
      <span className="block text-[11px] font-semibold">{field.label}</span>
      <div className="flex items-center gap-2"><input type="number" aria-label={field.label} min={field.min} max={field.max} step="1" value={draft[field.key]}
        onChange={event=>setDraft(value=>({...value,[field.key]:Number(event.target.value)}))} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"/><span className="text-[10px] text-muted-foreground">{field.unit}</span></div>
    </label>)}</div>
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
      <p className="flex items-center gap-2 font-bold text-primary"><Coins className="size-4"/> Simulação do limiar de Zenits</p>
      <p className="mt-1">6 kg → {zenitCapacity(6,draft)}z · 8 kg → {zenitCapacity(8,draft)}z · 10 kg → {zenitCapacity(10,draft)}z</p>
      <p className="mt-1 text-muted-foreground">O limiar monetário cresce por degraus, mas não bloqueia ganhos. Se os Zenits excederem esse limiar OU o peso físico superar o maior valor entre a capacidade da mochila e o limite definido por MIG + 2 kg / {draft.overloadPercent}% da capacidade, o personagem recebe uma única condição “Peso” (DEX −{draft.dexPenalty}). A condição desaparece automaticamente ao regularizar ambos.</p>
    </div>
    {loadError && <p role="alert" className="text-xs text-amber-300">Não foi possível consultar a configuração salva.</p>}
    {error && <p role="alert" className="flex gap-2 text-xs text-red-300"><AlertTriangle className="size-4"/>{error}</p>}
    {success && <p role="status" className="text-xs text-emerald-300">{success}</p>}
    <button type="button" disabled={saving || loading} onClick={()=>void save()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary/50 bg-primary/15 px-4 text-xs font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40"><Save className="size-4"/>{saving?"Salvando...":"Aplicar regras à campanha"}</button>
  </section>
}
