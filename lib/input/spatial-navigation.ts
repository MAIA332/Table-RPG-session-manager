/** Navegação espacial pelo controle. Privilegia a MESMA linha/coluna;
 * nunca confunde um elemento abaixo com um vizinho à direita. */
export type NavDirection = 'up' | 'down' | 'left' | 'right'
export interface NavRect { left: number; right: number; top: number; bottom: number }
function center(a: number, b: number) { return (a + b) / 2 }
function separation(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, a0 - b1, b0 - a1)
}
export function nearestInDirection(origin: NavRect, choices: readonly NavRect[], direction: NavDirection): number {
  const horizontal = direction === 'left' || direction === 'right'
  const forwardSign = direction === 'right' || direction === 'down' ? 1 : -1
  const ox = center(origin.left, origin.right)
  const oy = center(origin.top, origin.bottom)
  const mainOrigin = horizontal ? ox : oy
  const crossOrigin = horizontal ? oy : ox
  const originEnd = horizontal ? origin.right : origin.bottom
  const originStart = horizontal ? origin.left : origin.top
  let best = -1
  let score = Number.POSITIVE_INFINITY
  choices.forEach((r, index) => {
    const mainCenter = horizontal ? center(r.left, r.right) : center(r.top, r.bottom)
    const crossCenter = horizontal ? center(r.top, r.bottom) : center(r.left, r.right)
    const forward = (mainCenter - mainOrigin) * forwardSign
    if (forward <= 2) return
    const nearEdge = horizontal ? (forwardSign > 0 ? r.left : r.right) : (forwardSign > 0 ? r.top : r.bottom)
    const gap = Math.max(0, forwardSign > 0 ? nearEdge - originEnd : originStart - nearEdge)
    const crossGap = horizontal
      ? separation(origin.top, origin.bottom, r.top, r.bottom)
      : separation(origin.left, origin.right, r.left, r.right)
    // Uma área na diagonal só participa quando realmente está na direção
    // pedida; não saltar para outra linha/coluna distante da seta desejada.
    if (crossGap > 2 && crossGap > Math.max(20, forward * 0.5)) return
    const sameLane = crossGap <= 2
    const candidate = (sameLane ? 0 : 100000) + gap * 2 + forward * 0.35 +
      Math.abs(crossCenter - crossOrigin) * (sameLane ? 0.17 : 3.5) + crossGap * 8
    if (candidate < score) { score = candidate; best = index }
  })
  return best
}
