/** Usa a geometria dos botões reais, incluindo cabeçalho, rodapé e janelas sobrepostas. */
export function arenaButtons(root:HTMLElement):HTMLButtonElement[]{
 return [...root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(button=>{
  const bounds=button.getBoundingClientRect()
  return bounds.width>0&&bounds.height>0&&getComputedStyle(button).visibility!=='hidden'
 })
}
export function nextArenaButton(root:HTMLElement,current:HTMLButtonElement|undefined,direction:number):HTMLButtonElement|undefined{
 const buttons=arenaButtons(root)
 if(!buttons.length)return
 if(!current||!buttons.includes(current))return buttons.find(b=>b.matches('[data-roster-index],[data-stage-index]'))||buttons[0]
 const box=current.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,vertical=Math.abs(direction)===2,sign=Math.sign(direction)
 const candidates=buttons.filter(button=>button!==current).map(button=>{
  const rect=button.getBoundingClientRect(),dx=rect.x+rect.width/2-x,dy=rect.y+rect.height/2-y
  const primary=(vertical?dy:dx)*sign,secondary=Math.abs(vertical?dx:dy)
  const aligned=vertical?Math.min(box.right,rect.right)-Math.max(box.left,rect.left)>4:Math.min(box.bottom,rect.bottom)-Math.max(box.top,rect.top)>4
  return {button,primary,score:primary+secondary*(aligned?.45:2.5)}
 }).filter(c=>c.primary>3).sort((a,b)=>a.score-b.score)
 return candidates[0]?.button||current
}
