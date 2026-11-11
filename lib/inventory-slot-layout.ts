/** Layout visual local: nunca altera a ordem persistida nem o ID dos itens no servidor. */
export interface InventorySlotItem { key: string; index: number; id: string }
export function indexedInventory(equipment: readonly string[]): InventorySlotItem[] {
  const occurrences = new Map<string, number>()
  return equipment.map((id,index) => {
    const count = occurrences.get(id) || 0
    occurrences.set(id,count + 1)
    return {key: `${id}#${count}`, index, id}
  })
}
export function reconcileInventorySlots(existing: readonly (string|null)[], items: readonly InventorySlotItem[], minSlots = 35): (string|null)[] {
  const valid = new Set(items.map(item=>item.key))
  const used = new Set<string>()
  const slots = existing.slice(0,256).map(key => {
    if (!key || !valid.has(key) || used.has(key)) return null
    used.add(key);return key
  })
  while (slots.length < Math.max(minSlots, Math.ceil(items.length / 7) * 7)) slots.push(null)
  for (const item of items) {
    if(used.has(item.key))continue
    const free = slots.indexOf(null)
    if (free >= 0) slots[free] = item.key
    else slots.push(item.key)
    used.add(item.key)
  }
  return slots
}
export function swapInventorySlots(slots: readonly (string|null)[], source: number, destination: number) {
  if (source === destination || source < 0 || destination < 0 || source >= slots.length || destination >= slots.length) return [...slots]
  const next=[...slots]
  ;[next[source],next[destination]]=[next[destination],next[source]]
  return next
}
