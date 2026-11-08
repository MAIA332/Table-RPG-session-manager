/** Regra exclusiva da ficha e do dono indicados pelo Mestre. */
export const CHECK_MINIMUMS: Record<string, number> = {
  c1: 12, c2: 14, c17: 12, c20: 14, c22: 12, c23: 14,
  c24: 13, c27: 10, c28: 11, c29: 12, c38: 13, c64: 18, c65: 16,
}
export function hasCheckMinimums(character: { id: string; ownerId: string }): boolean {
  return character.id === "char_jlhky6s9mstuuli0" && character.ownerId === "user_gd68ua63msnua1nb"
}
