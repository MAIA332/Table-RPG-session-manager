/** Resultado imutável de um teste tradicional de criatura executado no servidor. */
export type MonsterCheckRoll = {
  id: string
  instanceId: string
  creatureName: string
  checkId: string
  checkName: string
  dice: string[]
  rolls: number[]
  breakdown?: string
  result: number
  at: number
  shared: boolean
}

/** O servidor só serializa dados de testes autorizados para cada espectador. */
export function visibleMonsterCheckRolls(rolls: MonsterCheckRoll[], isGm: boolean): MonsterCheckRoll[] {
  return isGm ? rolls : rolls.filter(roll => roll.shared === true)
}
