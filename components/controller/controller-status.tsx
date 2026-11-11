'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Gamepad2, Settings2 } from 'lucide-react'
import { ControllerGlyph } from './controller-glyph'

interface Props {active: boolean; connected: boolean; authenticated: boolean; name: string; lastAction: string; onOpen: () => void}
export function ControllerStatus({ active, connected, authenticated, name, lastAction, onOpen }: Props) {
  const [dock, setDock] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!active || !authenticated) { setDock(null); return }
    // The GM panel is conditionally mounted. Observe only structural changes:
    // after opening and closing, move the same HUD into a reserved layout slot.
    const checkDock = () => {
      const target = document.getElementById('gm-controller-hud-slot')
      setDock(previous => previous === target ? previous : target)
    }
    checkDock()
    const observer = new MutationObserver(checkDock)
    observer.observe(document.body, {childList:true, subtree:true})
    return () => observer.disconnect()
  }, [active, authenticated])

  if (!connected && !active) return null
  if (!authenticated) return connected ? <aside className="otms-controller-login-badge" title={name} aria-label="Controle conectado; entre na conta para configurar os comandos">
    <Gamepad2 size={17} /> Controle conectado
  </aside> : null
  if (!active) return null

  const hud = <aside className={`otms-controller-hud${dock ? ' otms-controller-hud-docked' : ''}`} aria-label="Controle ativo">
    <div className="otms-controller-hud-heading"><Gamepad2 size={16} /> <span>{connected ? 'Controle conectado' : 'Modo controle'}</span>
      <button type="button" title="Abrir configurações do controle" aria-label="Abrir configurações do controle" onClick={onOpen}><Settings2 size={17}/></button>
    </div>
    <div className="otms-controller-hud-keys"><ControllerGlyph button="A" small/> escolher <ControllerGlyph button="B" small/> voltar <ControllerGlyph button="MENU" small/> opções</div>
    {lastAction && <div className="otms-controller-last-action" aria-live="polite">{lastAction}</div>}
  </aside>
  return dock ? createPortal(hud, dock) : hud
}
