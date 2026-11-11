/** Scrolls the nearest visible panel containing controller focus.
 * No synthetic wheel events: mouse, keyboard and native scrolling stay unchanged.
 */
export function scrollControllerContent(delta: number): boolean {
  if (typeof document === 'undefined' || !Number.isFinite(delta) || delta === 0) return false
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const visible = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
  }
  const dialogs = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"], .otms-start-backdrop, .otms-inventory-modal, [data-controller-layer="active"]')].filter(visible)
  // Modals must not scroll the background document.
  const layer = dialogs.at(-1) || document.body
  const scrollers: HTMLElement[] = []
  const add = (el: HTMLElement | null) => {
    if (!el || scrollers.includes(el) || !visible(el)) return
    const style = getComputedStyle(el)
    if (el.scrollHeight > el.clientHeight + 3 && /auto|scroll|overlay/.test(style.overflowY)) scrollers.push(el)
  }
  if (active && layer.contains(active)) {
    for (let el: HTMLElement | null = active; el; el = el.parentElement) {
      add(el)
      if (el === layer) break
    }
  }
  // If the focus is on a fixed button or no scrollable ancestor exists, use
  // the closest scrollable panel in the active modal (or page).
  add(layer)
  if (layer === document.body) {
    const root = document.scrollingElement as HTMLElement | null
    // The document root often reports overflow-y: visible even while scrollable.
    if (root && !scrollers.includes(root) && root.scrollHeight > root.clientHeight + 3) scrollers.push(root)
  }
  if (!scrollers.length) {
    // Only candidate overflow containers; scanning every DOM node each frame
    // would be expensive in a campaign room with thousands of elements.
    const items = [...layer.querySelectorAll<HTMLElement>(
      '[class*="overflow-y"],[class*="overflow-auto"],[style*="overflow"],[data-controller-scroll]'
    )]
    const focusRect = active?.getBoundingClientRect()
    items.sort((a,b) => {
      const rectA=a.getBoundingClientRect(), rectB=b.getBoundingClientRect()
      const metric=(r: DOMRect) => focusRect
        ? Math.abs(r.top - focusRect.top) + Math.abs(r.left-focusRect.left)*0.25
        : Math.abs(r.top-window.innerHeight/2)
      return metric(rectA)-metric(rectB)
    })
    for(const el of items){add(el); if(scrollers.length)break}
  }
  for(const element of scrollers){
    const before=element.scrollTop
    const next=Math.max(0,Math.min(element.scrollHeight-element.clientHeight,before+delta))
    if(Math.abs(next-before) < 0.5) continue
    element.scrollTop=next
    return true
  }
  return false
}
