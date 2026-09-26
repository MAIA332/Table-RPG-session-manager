export const DEATH_TABLE = [
  { min: 3, max: 7, status: "dead", label: "Morto", effect: "Permanece com 0 HP. Retorno à vida depende do Mestre." },
  { min: 8, max: 12, status: "dying", label: "Agonizando", effect: "Permanece com 0 HP e precisa de socorro." },
  { min: 13, max: 17, status: "stable", label: "Estabilizado", effect: "Inconsciente com 0 HP, sem deterioração automática." },
  { min: 18, max: Infinity, status: "recovered", label: "Resistiu à morte", effect: "Recupera 1 HP e pode voltar a agir." },
] as const
export type DeathStatus = typeof DEATH_TABLE[number]["status"]
export type DeathCheck = {
  id: string; at: number; characterId: string; characterName: string
  die: string; rolls: number[]; total: number; status: DeathStatus
  label: string; effect: string; active: boolean
}
export function deathDieSize(die: string) {
  const match = /^d(4|6|8|10|12|20)$/i.exec(die.trim())
  if (!match) throw new Error("Dado de MIG inválido para o teste de morte")
  return Number(match[1])
}
export function deathOutcome(total: number) {
  if (!Number.isSafeInteger(total) || total < 3) throw new Error("Resultado de morte inválido")
  return DEATH_TABLE.find(row => total >= row.min && total <= row.max)!
}
