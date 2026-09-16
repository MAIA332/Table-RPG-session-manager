import type { StoreFolder } from "./types"

// IDs reservados identificam as pastas padrão, mesmo em cadastros antigos
// que não possuem isSystem. A primeira ocorrência salva prevalece.
export function normalizeStoreFolders(value: readonly StoreFolder[] | null | undefined): StoreFolder[] {
  const defaults: StoreFolder[] = [
    { id: "system", name: "SISTEMA", isVisible: true, isSystem: true },
    { id: "custom", name: "CUSTOM", isVisible: true, isSystem: true },
  ]
  const saved = new Map<string, StoreFolder>()
  for (const folder of Array.isArray(value) ? value : []) {
    if (!folder || typeof folder.id !== "string" || !folder.id.trim() || saved.has(folder.id)) continue
    saved.set(folder.id, folder)
  }
  const merged = defaults.map(base => {
    const folder = saved.get(base.id)
    saved.delete(base.id)
    return {
      ...base,
      ...folder,
      id: base.id,
      name: folder?.name?.trim() || base.name,
      isVisible: typeof folder?.isVisible === "boolean" ? folder.isVisible : base.isVisible,
      isSystem: true,
    }
  })
  return [...merged, ...Array.from(saved.values(), folder => ({
    ...folder,
    isVisible: folder.isVisible !== false,
    isSystem: false,
  }))]
}
