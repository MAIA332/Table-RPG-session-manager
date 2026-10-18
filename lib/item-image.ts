/**
 * URL de arte opcional de equipamento. Só permitimos imagens públicas HTTPS.
 * A URL é armazenada no item do catálogo, não no personagem.
 */
export function itemImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const input = value.trim()
  if (!input || input.length > 2048) return null
  try {
    const url = new URL(input)
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) return null
    return url.href
  } catch {
    return null
  }
}

export function validateItemImageUrl(value: unknown): string {
  if (value === "" || value === undefined || value === null) return ""
  const url = itemImageUrl(value)
  if (!url) throw new Error("Imagem inválida. Informe uma URL pública HTTPS completa, sem credenciais (máximo 2048 caracteres).")
  return url
}
