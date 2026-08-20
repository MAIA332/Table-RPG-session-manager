export const PORTRAIT_FRAMES = [
  { id: "bronze", name: "Bronze", detail: "Metal de aventureiro" },
  { id: "wood", name: "Madeira", detail: "Entalhe de viagem" },
  { id: "parchment", name: "Pergaminho", detail: "Sessão" },
  { id: "arcane", name: "Arcana", detail: "Runas de mana" },
  { id: "academic", name: "Academica", detail: "Brasao da escola" },
  { id: "nature", name: "Natural", detail: "Folhagem antiga" },
  { id: "gothic", name: "Gotica", detail: "Ferro sombrio" },
  { id: "ornate", name: "Ornamental", detail: "Filigrana cerimonial" },
  { id: "simple", name: "Simples", detail: "Contorno discreto" },
] as const

export type PortraitFrameId = (typeof PORTRAIT_FRAMES)[number]["id"]

export function normalizePortraitFrame(value: unknown): PortraitFrameId {
  return PORTRAIT_FRAMES.some((frame) => frame.id === value) ? value as PortraitFrameId : "bronze"
}

export function getPortraitFrameStroke(value: unknown): string {
  switch (normalizePortraitFrame(value)) {
    case "wood": return "#785438"
    case "parchment": return "#c5ad7e"
    case "arcane": return "#6f8fb7"
    case "academic": return "#9a4550"
    case "nature": return "#6f805a"
    case "gothic": return "#6e6971"
    case "ornate": return "#c99b55"
    case "simple": return "#d6ccba"
    default: return "#ad7b3b"
  }
}
