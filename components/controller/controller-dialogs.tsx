'use client'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { registerInputHandler } from '@/lib/input/dispatcher'
import type { ControllerDialogRequest } from '@/lib/input/dialogs'
import { ControllerGlyph } from './controller-glyph'

/** Focus-trapped, asynchronous dialogs; unlike window.confirm, Gamepad polling
 * continues and B can always cancel. Confirm defaults to Cancel for safety. */
export function ControllerDialogs() {
  const [queue, setQueue] = useState<ControllerDialogRequest[]>([])
  const current = queue[0]
  const currentRef = useRef(current); currentRef.current = current
  const rootRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const settle = (accepted: boolean) => {
    const request = currentRef.current
    if (!request) return
    request.resolve(request.kind === 'confirm' ? accepted : true)
    setQueue(existing => existing.filter(item=>item.id!==request.id))
  }
  const settleRef = useRef(settle); settleRef.current = settle
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ControllerDialogRequest>).detail
      if(detail && typeof detail.resolve === 'function') setQueue(q => [...q,detail])
    }
    window.addEventListener('otms.controller.dialog', handler)
    return () => window.removeEventListener('otms.controller.dialog', handler)
  }, [])
  useEffect(() => {
    if(!current) return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    requestAnimationFrame(() => (current.kind==='confirm' ? cancelRef : confirmRef).current?.focus({preventScroll:true}))
    return () => { previousFocus.current?.isConnected && previousFocus.current.focus({preventScroll:true}) }
  }, [current?.id])
  useEffect(() => registerInputHandler(action => {
    if (!currentRef.current) return false
    if(action==='ui.back' || action==='ui.settings') {settleRef.current(false);return true}
    if(action==='ui.confirm') {
      const dialog = rootRef.current
      const active = document.activeElement
      const accepted:any = dialog?.contains(active) && active === confirmRef.current
      settleRef.current(accepted)
      return true
    }
    if(['ui.left','ui.right','ui.up','ui.down','ui.previous','ui.next'].includes(action)) {
      if(currentRef.current.kind==='confirm') {
        const next = document.activeElement===confirmRef.current ? cancelRef : confirmRef
        next.current?.focus({preventScroll:true})
      } else confirmRef.current?.focus({preventScroll:true})
      return true
    }
    return true // Never allow game actions behind this dialog.
  }, 3000), [])
  if(!current) return null
  return <div className="otms-controller-dialog-backdrop" data-controller-layer="active">
    <div ref={rootRef} role="alertdialog" aria-modal="true" aria-labelledby="otms-controller-dialog-title"
      aria-describedby="otms-controller-dialog-message" className="otms-controller-dialog" onKeyDown={event=>{
        if(event.key==='Escape'){event.preventDefault();settle(false)}
        if(event.key==='Tab'){
          const next = document.activeElement===confirmRef.current ? cancelRef.current : confirmRef.current
          next?.focus();event.preventDefault()
        }
      }}>
      <div className="otms-controller-dialog-heading">
        {current.kind==='confirm' ? <AlertTriangle size={22}/> : <CheckCircle2 size={22}/>}
        <h2 id="otms-controller-dialog-title">{current.kind==='confirm'?'CONFIRMAR AÇÃO':'AVISO'}</h2>
      </div>
      <p id="otms-controller-dialog-message">{current.message}</p>
      <footer>
        {current.kind==='confirm' && <button ref={cancelRef} type="button" onClick={()=>settle(false)}><ControllerGlyph button="B" small/> Cancelar</button>}
        <button ref={confirmRef} type="button" className="otms-controller-dialog-confirm" onClick={()=>settle(true)}><ControllerGlyph button="A" small/> {current.kind==='confirm'?'Confirmar':'Entendi'}</button>
      </footer>
    </div>
  </div>
}
