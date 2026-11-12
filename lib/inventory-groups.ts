/** Classificação única para itens oficiais, personalizados e cadastros antigos. */
export const INVENTORY_GROUPS = ['Todos', 'Armas', 'Proteção', 'Consumíveis', 'Outros'] as const
export type InventoryGroup = (typeof INVENTORY_GROUPS)[number]

export function inventoryGroupOf(item: unknown): InventoryGroup {
  if (!item || typeof item !== 'object') return 'Outros'
  const value = item as Record<string, unknown>
  // Consumable é o indicador usado pelas ações reais de uso, mesmo que o item seja
  // cadastrado como "misc" ou "accessory".
  if (value.consumable === true) return 'Consumíveis'
  const raw = `${value.category ?? ''} ${value.type ?? ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/consum|potion|pocao|alimento|food|elixir|remedio|comida/.test(raw)) return 'Consumíveis'
  if (/weapon|arma|cajado|espada|lanca|arco|adaga|firearm/.test(raw)) return 'Armas'
  if (/armor|armour|armadura|shield|escudo|accessor|acessor|protecao|defesa/.test(raw)) return 'Proteção'
  return 'Outros'
}
