'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  collectActions, DEFAULT_SETTINGS, gamepadButtons, getBindings, sanitizeSettings, SETTABLE_COMMANDS,
  detectedButtonNames, isRemappableButton, actionForButton,
  STORAGE_KEY, type GamepadButtonName, type InputSettings, type InputAction,
} from '@/lib/input/actions'
import { ACTION_LABELS } from '@/lib/input/labels'
import { dispatchInputAction, registerInputHandler } from '@/lib/input/dispatcher'
import { dispatchInputHoldAction } from '@/lib/input/hold'
import { controllerFocus, controllerFocusedFieldAction, clearControllerFocus, controllerSelectOpen, closeControllerSelect, rememberControllerFocus, captureControllerFocusBeforeConfirm, restoreControllerFocusAfterConfirm } from '@/lib/input/focus'
import { controllerKeyboardOpen, handleControllerKeyboard, handleControllerKeyboardButton, closeControllerKeyboard } from '@/lib/input/virtual-keyboard'
import { scrollControllerContent } from '@/lib/input/scroll'
import { isEditableKeyboardTarget } from '@/lib/input/keyboard-target'
import { dispatchRightStick } from '@/lib/input/right-stick'
import { contextualShortcut, replaceContextualActions, type ContextualScope } from '@/lib/input/contextual-shortcuts'
import { ControllerDialogs } from './controller-dialogs'
import { triggerPanelAction, labelForPanelAction } from '@/lib/input/panel-actions'
import { ControllerStatus } from './controller-status'
import { ControllerStartMenu, MENU_TABS, type ControllerMenuTab } from './controller-start-menu'
import { ControllerWheel } from './controller-wheel'
import { createControllerSounds } from '@/lib/input/controller-sounds'
import { recordControllerPointerOrigin, recordControllerCommandOrigin, captureControllerOpener, restoreControllerOpener } from '@/lib/input/focus-origin'
import type { ControllerTarget } from '@/lib/input/targeted-actions'
import { soundpadRuntimeBindings } from '@/lib/input/soundpad-commands'

interface ControllerContextValue {
  active: boolean
  connected: boolean
  name: string
  ltHeld: boolean
  page: number
  settings: InputSettings
  update: (patch: Partial<InputSettings>) => void
  openSettings: () => void
  availableButtons: GamepadButtonName[]
}
const ControllerContext = createContext<ControllerContextValue | null>(null)
/** Proteção para o roteamento; não cria contextos duplicados. */
export function ControllerBoundary({children}: {children: ReactNode}) {
  const inherited = useContext(ControllerContext)
  return inherited === null ? <ControllerProvider>{children}</ControllerProvider> : <>{children}</>
}
export function useController() {
  const value = useContext(ControllerContext)
  if (!value) throw new Error('useController requer ControllerProvider')
  return value
}
export function ControllerProvider({children}: {children:ReactNode}) {
  const pathname = usePathname()
  const authenticated = !!pathname && pathname !== '/'
  const authenticatedRef = useRef(authenticated); authenticatedRef.current = authenticated
  const [settings, setSettings] = useState<InputSettings>(DEFAULT_SETTINGS)
  const [settingsReady, setSettingsReady] = useState(false)
  const settingsRef = useRef(settings); settingsRef.current = settings
  const [connected, setConnected] = useState(false)
  const [name, setName] = useState('')
  const [availableButtons, setAvailableButtons] = useState<GamepadButtonName[]>([])
  const captureRef = useRef<InputAction | null>(null)
  const [lastInput, setLastInput] = useState<'controller' | 'desktop'>('desktop')
  const [ltHeld, setLtHeld] = useState(false)
  const [page, setPage] = useState(0)
  const pageRef = useRef(0)
  useEffect(() => {
    const next = Math.min(pageRef.current, settings.slots.length - 1)
    if (pageRef.current !== next) { pageRef.current = next; setPage(next) }
  }, [settings.slots.length])
  const [skillNames, setSkillNames] = useState<string[]>([])
  const [skillChoices, setSkillChoices] = useState<ControllerTarget[]>([])
  const [specialChoices, setSpecialChoices] = useState<ControllerTarget[]>([])
  const [characterChoices, setCharacterChoices] = useState<ControllerTarget[]>([])
  const [lastAction, setLastAction] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuTab, setMenuTab] = useState<ControllerMenuTab>('bindings')
  const active = settings.preference === 'controller' || (settings.preference === 'auto' && lastInput === 'controller')
  const activeRef = useRef(active); activeRef.current = active
  const settingsOpenRef = useRef(settingsOpen); settingsOpenRef.current = settingsOpen
  useEffect(() => {
    if (!settingsOpen) return
    const origin = captureControllerOpener()
    return () => { if (activeRef.current) restoreControllerOpener(origin) }
  }, [settingsOpen])

  const menuTabRef = useRef(menuTab); menuTabRef.current = menuTab
  const update = (patch: Partial<InputSettings>) => setSettings(previous => sanitizeSettings({...previous, ...patch}))
  const openSettings = () => { if (authenticatedRef.current) setSettingsOpen(true) }
  const requestCapture = (action: InputAction) => { captureRef.current = action }

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      // v1 had vibration turned off by default. Migrate it once so existing users
      // receive the new ON default without losing their mappings. Subsequent OFF
      // choices remain respected.
      const migrationKey = 'otms-controller-vibration-default-v2'
      if (localStorage.getItem(migrationKey) !== 'done') {
        saved.vibration = true
        localStorage.setItem(migrationKey, 'done')
      }
      // Atualização única dos antigos defaults (28% / 155 ms). Preferências
      // personalizadas diferentes desses valores permanecem intactas.
      const defaultsMigration = 'otms-controller-defaults-v7'
      if (localStorage.getItem(defaultsMigration) !== 'done') {
        if (saved.deadzone === 0.28) saved.deadzone = 0.65
        if (saved.repeatMs === 155) saved.repeatMs = 235
        localStorage.setItem(defaultsMigration, 'done')
      }
      const next = sanitizeSettings(saved)
      if (new URLSearchParams(location.search).get('tv') === '1') next.preference = 'controller'
      setSettings(next)
    } catch { setSettings(DEFAULT_SETTINGS) }
    finally { setSettingsReady(true) }
  }, [])
  // Do not overwrite an existing profile with defaults before localStorage hydration.
  useEffect(() => { if (!settingsReady) return; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch {} }, [settings, settingsReady])
  useEffect(() => { if (!authenticated) setSettingsOpen(false) }, [authenticated])
  useEffect(() => { if (!settingsOpen) {captureRef.current=null;closeControllerSelect(false)} }, [settingsOpen])
  useEffect(() => {
    const handleSkills = (event: Event) => {
      const detail = (event as CustomEvent<{skills?:ControllerTarget[], specials?:ControllerTarget[], characters?:ControllerTarget[], names?:string[]}>).detail
      if (Array.isArray(detail?.skills)) {
        setSkillChoices(detail.skills.filter(item => item?.id && item?.name).slice(0,120))
        setSkillNames(detail.skills.map(item=>item.name).slice(0,4))
      } else if (Array.isArray(detail?.names)) setSkillNames(detail.names.slice(0,4).map(name => String(name).slice(0,100)))
      if (Array.isArray(detail?.specials)) setSpecialChoices(detail.specials.filter(item => item?.id && item?.name).slice(0,30))
      if (Array.isArray(detail?.characters)) setCharacterChoices(detail.characters.filter(item => item?.id && item?.name).slice(0,50))
    }
    window.addEventListener('otms.controller.skills', handleSkills)
    return () => { window.removeEventListener('otms.controller.skills', handleSkills) }
  }, [])

  useEffect(() => () => closeControllerKeyboard(false), [])
  useEffect(() => {
    document.documentElement.dataset.input = active ? 'controller' : 'desktop'
    document.documentElement.dataset.tvScale = active && settings.tvScale ? 'true' : 'false'
    if (!active) clearControllerFocus()
    return () => {document.documentElement.dataset.input = 'desktop'; document.documentElement.dataset.tvScale = 'false'; clearControllerFocus()}
  }, [active, settings.tvScale])

  // Menu Start = maior prioridade. Não deixa comandos de combate vazarem por trás do menu.
  useEffect(() => registerInputHandler(action => {
    if (!settingsOpenRef.current) return false
    if (controllerKeyboardOpen()) return handleControllerKeyboard(action)
    if (controllerSelectOpen()) return controllerFocus(action)
    if (action === 'ui.back' || action === 'ui.settings') {setSettingsOpen(false); return true}
    if (action === 'ui.previous' || action === 'ui.next') {
      const index = MENU_TABS.indexOf(menuTabRef.current)
      setMenuTab(MENU_TABS[(index + (action === 'ui.next' ? 1 : -1) + MENU_TABS.length) % MENU_TABS.length]); return true
    }
    if (action.startsWith('ui.')) { controllerFocus(action); return true }
    return true
  }, 1000), [])

  // Teclado e selects são superiores a todos os comandos do jogo.
  useEffect(() => registerInputHandler(action => controllerKeyboardOpen() ? handleControllerKeyboard(action) :
    controllerSelectOpen() ? controllerFocus(action) : false, 2200), [])
  // Campos editáveis sempre abrem o teclado no A e ajustam números nas setas,
  // mesmo quando o painel possui seu próprio handler de navegação.
  useEffect(() => registerInputHandler(action => controllerFocusedFieldAction(action), 1700), [])

  useEffect(() => registerInputHandler(action => {
    if (action === 'ui.settings') {
      if (authenticatedRef.current) {setSettingsOpen(value => !value); return true}
      return true // Start nunca abre as opções na tela pública de login.
    }
    if (action === 'skill.nextPage') {
      if (!authenticatedRef.current) return true
      pageRef.current = (pageRef.current + 1) % settingsRef.current.slots.length
      setPage(pageRef.current); return true
    }
    const slot = /^skill\.slot([1-4])$/.exec(action)
    if (slot) {
      if (!authenticatedRef.current) return true
      const target = settingsRef.current.slots[pageRef.current]?.[Number(slot[1]) - 1]
      if (target) dispatchInputAction(target)
      return true
    }
    if (action.startsWith('panel.')) return triggerPanelAction(action)
    // B nunca deve sair da campanha como efeito colateral de fechar um modal.
    return controllerFocus(action)
  }, -50), [])

  useEffect(() => {
    let frame = 0, idleTimer = 0, previous = new Set<GamepadButtonName>(), lastIndex = -1
    let pttDown = false
    let pttArmed = false // Após perda de foco/controle, exige soltar antes de falar novamente.
    const releasePtt = () => { if (pttDown) {pttDown = false; dispatchInputHoldAction('voice.ptt', false)} }
    let lastNativeAt = 0, wasConnected = false, lastName = '', lastButtonCount = -1, lastScrollAt = 0, lastDialogStickAt = 0
    const times = new Map<string,number>()
    const lastChecksDpad = {LEFT: 0, RIGHT: 0}
    // Código oculto: VIEW + L3 + R3, segurados 650 ms em QUALQUER controle.
    // É físico, não remapeável e nunca pode ser disparado por teclado/mouse.
    const arenaSecret = new Map<number, {since:number;fired:boolean}>()
    const sounds = createControllerSounds()
    let lastControllerActionAt = -Infinity
    const runAction = (action: InputAction, pad?: Gamepad, nativeController = false) => {
      if (pad || nativeController) document.documentElement.dataset.otmsControllerActionAt = String(Date.now())
      // Keyboard and mouse should never produce controller-specific sounds.
      if ((pad || nativeController) && activeRef.current) {
        lastControllerActionAt = performance.now()
        const isNavigation = ['ui.up','ui.down','ui.left','ui.right','map.panUp','map.panDown','map.panLeft','map.panRight'].includes(action)
        if (!isNavigation && settingsRef.current.soundClick) sounds.play('click')
      }
      if (pad || nativeController) recordControllerCommandOrigin(document.activeElement)
      // A pode desmontar a origem (botão que muda de estado, confirmação,
      // testes e listas). Conservar o ponto de navegação, sem roubar o foco
      // quando uma nova modal ou o teclado virtual foi aberto.
      const confirmAnchor = action === 'ui.confirm' && activeRef.current
        ? captureControllerFocusBeforeConfirm() : null
      dispatchInputAction(action)
      if (confirmAnchor) {
        requestAnimationFrame(() => restoreControllerFocusAfterConfirm(confirmAnchor))
        window.setTimeout(() => restoreControllerFocusAfterConfirm(confirmAnchor), 90)
      }
      if (!['ui.up','ui.down','ui.left','ui.right'].includes(action) && !action.startsWith('map.pan'))
        setLastAction(ACTION_LABELS[action] || labelForPanelAction(action))
      if (pad && settingsRef.current.vibration && (action === 'ui.confirm' || action.startsWith('skill.') || action === 'qte.react')) {
        const actuator = (pad as Gamepad & {vibrationActuator?: {playEffect?: (type:string,params:{duration:number;startDelay:number;strongMagnitude:number;weakMagnitude:number})=>Promise<unknown>}}).vibrationActuator
        void actuator?.playEffect?.('dual-rumble',{duration:45,startDelay:0,strongMagnitude:.09,weakMagnitude:.16})?.catch(()=>{})
      }
    }
    const schedule = (fast: boolean, hasPad: boolean) => {
      if (fast) frame = window.requestAnimationFrame(tick)
      else idleTimer = window.setTimeout(tick, hasPad ? 110 : 450)
    }
    const tick = () => {
      if (document.visibilityState === 'hidden' || !document.hasFocus()) {pttArmed=false;releasePtt();previous.clear(); times.clear(); schedule(false,wasConnected);return}
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []
      for (const candidate of pads) {
        if (!candidate?.connected) continue
        const chord = [10,11].every(index => candidate.buttons[index]?.pressed)
        if (!chord) {arenaSecret.delete(candidate.index);continue}
        const state = arenaSecret.get(candidate.index) || {since:performance.now(),fired:false}
        if (!state.fired && performance.now() - state.since >= 650 && authenticatedRef.current) {
          state.fired = true
          window.dispatchEvent(new CustomEvent('otms.arena.secret', {detail:{index:candidate.index}}))
        }
        arenaSecret.set(candidate.index,state)
      }
      const pad = (lastIndex >= 0 ? pads[lastIndex] : undefined) || [...pads].find(Boolean)
      if (!!pad !== wasConnected) {
        wasConnected = !!pad;setConnected(wasConnected)
        if (!pad) {lastName='';lastButtonCount=-1;setName('');setAvailableButtons([]);setLtHeld(false);previous.clear();times.clear();lastIndex=-1;if(settingsRef.current.preference==='auto')setLastInput('desktop')}
      }
      if (!pad) {schedule(false,false);return}
      schedule(activeRef.current,true)
      lastIndex=pad.index
      if(pad.id!==lastName || pad.buttons.length !== lastButtonCount){
        lastName=pad.id;lastButtonCount=pad.buttons.length;setName(pad.id);setAvailableButtons(detectedButtonNames(pad.buttons.length))
      }
      const buttons=gamepadButtons(pad,settingsRef.current.deadzone)
      // A arena é dona exclusiva de todos os comandos enquanto está aberta.
      // Evita navegar fichas, executar ações ou abrir o menu Start no meio da luta.
      if (document.documentElement.dataset.otmsArenaActive === 'true' ||
          [8,10,11].every(index => pad.buttons[index]?.pressed)) {
        releasePtt(); previous = buttons; return
      }
      if(buttons.has('LT')!==previous.has('LT'))setLtHeld(buttons.has('LT'))
      // Descobre o escopo ANTES de processar PTT: se o jogador mapeou voz.ptt
      // para LB/RB/L3/R3, o atalho contextual também deve suspender o hold.
      const soundpadFocused = !settingsOpenRef.current && !!document.querySelector('[data-soundpad-fullscreen]')
      const modalBlocking = !!document.querySelector('.otms-controller-dialog-backdrop, .otms-controller-select-overlay, .otms-controller-keyboard-overlay')
      const grimoire = document.querySelector<HTMLElement>('[data-controller-grimoire-shortcuts="active"]')
      const checks = document.querySelector<HTMLElement>('[data-controller-checks-shortcuts="active"]')
      const specialAttacks = document.querySelector('[data-controller-special-attacks-shortcuts="active"]')
      const inventoryGrid = document.querySelector('[data-controller-inventory-shortcuts="active"]')
      const storeModal = document.querySelector<HTMLElement>('[data-controller-store-shortcuts="active"]')
      const bestiary = document.querySelector('[data-controller-bestiary-shortcuts="active"]')
      const gmEditCandidate = document.querySelector<HTMLElement>('[data-controller-gm-edit="active"], [data-controller-special-attacks-shortcuts="active"], [data-controller-inventory-shortcuts="active"]')
      const modalStack = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].filter(element =>
        element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0)
      const gmEdit = gmEditCandidate && (!modalStack.length ||
        modalStack.at(-1) === gmEditCandidate.closest('[aria-modal="true"]') ||
        gmEditCandidate.contains(modalStack.at(-1)!)) ? gmEditCandidate : null
      const combatModal = document.querySelector<HTMLElement>('[data-controller-combat-modal="active"]')
      const tableAvailable = !document.querySelector('[aria-modal="true"], [data-controller-layer="active"]')
      const combatPanel = combatModal || (tableAvailable
        ? document.querySelector<HTMLElement>('[data-controller-combat-table="active"]') : null)
      const topModal = modalStack.at(-1) || null
      // Uma confirmação sobreposta suspende os atalhos do painel de baixo.
      const specialVisible = !!specialAttacks && (!topModal || specialAttacks.querySelector('[role="dialog"]') === topModal)
      const inventoryVisible = !!inventoryGrid && (!topModal || inventoryGrid.closest('[aria-modal="true"]') === topModal)
      const storeVisible = !!storeModal && (!topModal || storeModal === topModal)
      const grimoireVisible = !!grimoire && topModal === grimoire
      const checksVisible = !!checks && checks.getClientRects().length > 0 && (!topModal || topModal.contains(checks))
      const scope: ContextualScope = !soundpadFocused && !settingsOpenRef.current && !modalBlocking
        ? grimoireVisible ? 'grimoire' : storeVisible ? 'store' : specialVisible ? 'special-attacks' : checksVisible ? 'checks' : inventoryVisible ? 'inventory' : bestiary ? 'bestiary' : combatPanel ? 'combat' : gmEdit ? 'gm' : null : null
      const hasCreature = combatPanel?.dataset.controllerHasCreature === 'true'
      const sheetWithFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement.closest<HTMLElement>('[data-controller-sheet-navigation="active"]') : null
      const sheetOwnsShoulders = !!sheetWithFocus && !buttons.has('LT') &&
        (!topModal || topModal.contains(sheetWithFocus)) && !modalBlocking
      const physicallyPtt = !controllerKeyboardOpen() && scope !== 'store' && [...buttons].some(button =>
        !(sheetOwnsShoulders && (button === 'LB' || button === 'RB')) &&
        !(scope && !buttons.has('LT') && contextualShortcut(button, scope, hasCreature)) &&
        actionForButton(button, buttons, getBindings(settingsRef.current)) === 'voice.ptt')
      if (settingsOpenRef.current) pttArmed = false
      if (!physicallyPtt) pttArmed = true
      const wantPtt = pttArmed && !settingsOpenRef.current &&
        settingsRef.current.preference !== 'desktop' && physicallyPtt
      if (wantPtt !== pttDown) {pttDown = wantPtt; dispatchInputHoldAction('voice.ptt', wantPtt)}
      const newlyPressed=[...buttons].filter(button=>!previous.has(button))
      const pressedNew=newlyPressed.length>0
      if(pressedNew&&settingsRef.current.preference==='auto')setLastInput('controller')
      if (captureRef.current) {
        const action=captureRef.current
        const key=newlyPressed.find(button => button === 'B' || isRemappableButton(button))
        if (key) {
          const captured = buttons.has('LT') && (key === 'LS' || key === 'RS') ? `LT+${key}` : key
          captureRef.current=null
          window.dispatchEvent(new CustomEvent('otms.controller.captured', {detail:{action,button:captured}}))
        }
        previous=buttons
        return
      }
      const now=performance.now()
      const axisX=pad.axes[2] ?? 0
      const axisY=pad.axes[3] ?? 0
      const elapsed=lastScrollAt ? Math.min(48,now-lastScrollAt) : 16
      const deadzone=settingsRef.current.deadzone
      const hasRightStick=Math.abs(axisX)>deadzone || Math.abs(axisY)>deadzone
      // O manequim pode usar os dois eixos para girar/aproximar, sem rolar a página.
      // Menus de confirmação e Start continuam tendo prioridade sobre esse gesto.
      // Em seleção/teclado virtual, o stick direito navega escolhas ao invés de
      // rolar sem atualizar o índice confirmado por A. Não vaza comandos ao mapa.
      const floatingChoices = controllerKeyboardOpen() || controllerSelectOpen()
      const rightStickDialog = activeRef.current && floatingChoices && hasRightStick
      if (rightStickDialog && Math.abs(axisY) > deadzone && now - lastDialogStickAt >= 195) {
        controllerFocus(axisY > 0 ? 'ui.down' : 'ui.up')
        lastDialogStickAt = now
      }
      const rightStickTaken = !!rightStickDialog || (activeRef.current && hasRightStick && !settingsOpenRef.current &&
        dispatchRightStick(Math.abs(axisX)>deadzone ? axisX : 0, Math.abs(axisY)>deadzone ? axisY : 0, elapsed))
      let scrolled=false
      if(activeRef.current && !rightStickTaken && Math.abs(axisY)>deadzone){
        scrolled=scrollControllerContent(Math.sign(axisY)*Math.pow(Math.abs(axisY),1.3)*Math.max(5,elapsed*1.3))
      }
      lastScrollAt=now
      // O teclado virtual possui layout FÍSICO próprio. Não deixar comandos
      // remapeados (inclusive PTT, inventário e Start) escaparem pelo jogo.
      // A seleção A/B e o direcional repetem; atalhos de edição repetem
      // somente após uma pausa, para evitar apagar letras em excesso.
      if (activeRef.current && controllerKeyboardOpen()) {
        for (const button of newlyPressed) {
          if (handleControllerKeyboardButton(button)) {
            times.set(`vk:${button}`, now)
            times.set(`vk-start:${button}`, now)
          }
        }
        for (const button of buttons) {
          if (!['X','LB','RT'].includes(button) || !previous.has(button) || !controllerKeyboardOpen()) continue
          const last = times.get(`vk:${button}`) ?? now
          const heldFor = times.get(`vk-start:${button}`) ?? now
          if (!times.has(`vk-start:${button}`)) times.set(`vk-start:${button}`, now)
          if (now - heldFor > 430 && now - last >= 95) {
            handleControllerKeyboardButton(button)
            times.set(`vk:${button}`, now)
          }
        }
        const vkActions = collectActions(buttons, previous, now, times,
          settingsRef.current.repeatMs, {
            A:'ui.confirm', B:'ui.back', UP:'ui.up', DOWN:'ui.down',
            LEFT:'ui.left', RIGHT:'ui.right',
          })
        for (const action of vkActions) {
          if (!controllerKeyboardOpen()) break
          runAction(action, pad)
        }
        previous=buttons
        for (const button of ['X','LB','RT'] as const) {
          if (!buttons.has(button)) {times.delete(`vk:${button}`);times.delete(`vk-start:${button}`)}
        }
        return
      }
      // Soundpad fullscreen owns its gamepad profile. It cannot execute ordinary
      // campaign shortcuts, and closing it restores the user's normal profile.
      const bindings = soundpadFocused
        ? soundpadRuntimeBindings(settingsRef.current.soundpadBindings)
        : getBindings(settingsRef.current)
      let actions=collectActions(buttons,previous,now,times,settingsRef.current.repeatMs, scope === 'store'
        ? {A:'ui.confirm', B:'ui.back', UP:'ui.up', DOWN:'ui.down', LEFT:'ui.left', RIGHT:'ui.right'}
        : bindings)
      // Painéis dedicados tomam posse temporária dos botões físicos, mesmo
      // quando LB/RB/L3/R3 foram personalizados no perfil global. O modal
      // de confirmação e o Start sempre prevalecem; LT mantém seus atalhos.
      if (scope === 'store') {
        // Mercado é dono de X/Y, bumpers, gatilhos e View. Bloquear inclusive
        // combos LT+... do perfil global, sem regravar as preferências do usuário.
        for (const button of newlyPressed) {
          const shortcut = contextualShortcut(button, 'store')
          if (shortcut) actions.push(shortcut)
        }
      } else if (scope) {
        actions = replaceContextualActions(actions, buttons, new Set(newlyPressed), scope,
          hasCreature, button => actionForButton(button, buttons, bindings))
      }
      const contextualPanelOpen = !!document.querySelector('[data-controller-bestiary-shortcuts="active"], [data-controller-combat-shortcuts="active"], [data-controller-gm-edit="active"], [data-controller-special-attacks-shortcuts="active"], [data-controller-inventory-shortcuts="active"], [data-controller-store-shortcuts="active"], [data-controller-grimoire-shortcuts="active"], [data-controller-checks-shortcuts="active"]')
      // Ficha aberta: LB/RB continuam SEMPRE trocando as três abas. Mesmo
      // remapeados no perfil, os ombros pertencem à ficha neste contexto.
      // Confirmações/teclados, LT e outros modais têm prioridade.
      const sheet = document.activeElement instanceof HTMLElement
        ? document.activeElement.closest<HTMLElement>('[data-controller-sheet-navigation="active"]') : null
      const sheetIsTop = !!sheet && !modalBlocking && !settingsOpenRef.current &&
        (!topModal || topModal.contains(sheet)) && !soundpadFocused && !buttons.has('LT')
      if (sheetIsTop) {
        for (const [button, nav] of [['LB', 'ui.previous'], ['RB', 'ui.next']] as const) {
          if (!buttons.has(button)) continue
          const mapped = actionForButton(button, buttons, bindings)
          if (mapped) actions = actions.filter(item => item !== mapped)
          if (newlyPressed.includes(button)) actions.push(nav)
        }
      }
      // Favoritos das Perícias usam EXCLUSIVAMENTE o D-PAD físico ←/→.
      // O analógico esquerdo permanece livre para navegação espacial normal;
      // usar ações semânticas ui.left/right aqui capturaria os dois dispositivos.
      if (scope === 'checks' && checks && !buttons.has('LT') && !settingsOpenRef.current &&
          !modalBlocking && !soundpadFocused &&
          (checks.contains(document.activeElement) || checks.closest('[data-controller-sheet-navigation="active"]')?.contains(document.activeElement))) {
        for (const [button, index, shortcut] of [
          ['LEFT', 14, 'checks.quick.previous'], ['RIGHT', 15, 'checks.quick.next'],
        ] as const) {
          const physicallyPressed = !!pad.buttons[index]?.pressed || (pad.buttons[index]?.value ?? 0) >= .55
          if (!physicallyPressed) {lastChecksDpad[button] = 0;continue}
          // Reservar a direção enquanto o D-pad está abaixado, mesmo entre
          // repetições, para não vazar movimento espacial do analógico.
          const mapped = actionForButton(button, buttons, bindings)
          if (mapped) actions = actions.filter(item => item !== mapped)
          if (!newlyPressed.includes(button) && now - lastChecksDpad[button] < settingsRef.current.repeatMs) continue
          actions.push(shortcut)
          lastChecksDpad[button] = now
        }
      }
      // SELECT/VIEW pode ser remapeado normalmente. Apenas uma foto de golpe
      // ativa do Mestre tem prioridade sobre o atalho configurado.
      const cancelablePreviews = [...document.querySelectorAll<HTMLElement>('[data-controller-preview-cancelable="true"]')]
      if (!soundpadFocused && newlyPressed.includes('VIEW') && settingsRef.current.preference !== 'desktop' && cancelablePreviews.length) {
        const mapped = actionForButton('VIEW', buttons, bindings)
        const index = mapped ? actions.indexOf(mapped) : -1
        if (index >= 0) actions.splice(index, 1)
        const latest = cancelablePreviews.sort((a,b) => Number(b.dataset.controllerPreviewStarted || 0) - Number(a.dataset.controllerPreviewStarted || 0))[0]
        if (latest.dataset.controllerPreviewId) window.dispatchEvent(new CustomEvent('otms.controller.close-special-preview', {detail:{previewId:latest.dataset.controllerPreviewId}}))
      }
      // Na loja, LB/RB alternam entre mochila, vitrine e inspeção mesmo que
      // os comandos globais tenham sido personalizados. Fora da loja não mudam.
      if(!soundpadFocused && !contextualPanelOpen && (newlyPressed.includes('LB') || newlyPressed.includes('RB')) && !settingsOpenRef.current &&
        !buttons.has('LT') && document.querySelector('[data-controller-store="active"]')) {
        for(const [button,nav] of [['LB','ui.previous'],['RB','ui.next']] as const){
          if(!newlyPressed.includes(button)) continue
          const mapped=actionForButton(button,buttons,bindings)
          const index=mapped ? actions.indexOf(mapped) : -1
          if(index>=0)actions.splice(index,1)
          actions.push(nav)
        }
      }
      // Na Forja do Viajante, LB/RB são sempre etapas, não atalhos globais.
      // O modificador LT continua separado. Fora da Forja, os mapeamentos
      // personalizados permanecem inalterados.
      if (!soundpadFocused && !contextualPanelOpen && !settingsOpenRef.current && !buttons.has('LT') &&
          document.querySelector('[data-controller-creator="active"]')) {
        for (const [button, nav] of [['LB','ui.previous'], ['RB','ui.next']] as const) {
          if (!newlyPressed.includes(button)) continue
          const mapped = actionForButton(button, buttons, bindings)
          const index = mapped ? actions.indexOf(mapped) : -1
          if (index >= 0) actions.splice(index, 1)
          actions.push(nav)
        }
      }
      // Quando a Mesa de Voz está aberta, os ombros mudam a aba sem exigir A,
      // independente dos atalhos globais; LT mantém seu modificador normal.
      if (!soundpadFocused && !contextualPanelOpen && !settingsOpenRef.current && !buttons.has('LT') &&
          document.querySelector('[data-voice-tab-navigation="active"]')) {
        for (const [button, nav] of [['LB', 'ui.previous'], ['RB', 'ui.next']] as const) {
          if (!buttons.has(button)) continue
          const mapped = actionForButton(button, buttons, bindings)
          if (mapped) {
            let index = actions.indexOf(mapped)
            while (index >= 0) { actions.splice(index, 1); index = actions.indexOf(mapped) }
          }
          // Uma aba por pressão; segurar LB/RB não executa um atalho global.
          if (newlyPressed.includes(button)) actions.push(nav)
        }
      }
      // LB/RB mudam a aba do próprio Start, mesmo se mapeados para Bestiário/Galeria fora dele.
      if(settingsOpenRef.current&&!buttons.has('LT')){
        if(buttons.has('LB')&&!previous.has('LB'))actions.push('ui.previous')
        if(buttons.has('RB')&&!previous.has('RB'))actions.push('ui.next')
      }
      if(settingsRef.current.preference!=='desktop'&&performance.now()-lastNativeAt>1200){
        for(const action of actions){
          // Only pan a Canvas map when the right stick did not scroll a panel.
          if((scrolled || rightStickTaken) && (action === 'map.panUp' || action === 'map.panDown' || action === 'map.panLeft' || action === 'map.panRight')) continue
          runAction(action,pad)
        }
      }
      previous=buttons
      for(const key of times.keys()){
        const base=key.split('+').at(-1) as GamepadButtonName
        if(!buttons.has(base))times.delete(key)
      }
    }
    // Canal reservado ao protótipo nativo WebView2. A API web não é obrigatória no host Xbox.
    const bridge=(event:{data?:unknown})=>{
      const data=event.data
      if(!data||typeof data!=='object')return
      const message=data as {type?:string;action?:string;held?:boolean}
      if(message.type!=='otms.input.v1')return
      lastNativeAt=performance.now()
      if(settingsRef.current.preference==='auto')setLastInput('controller')
      if(message.action==='LT'){setLtHeld(message.held===true);return}
      if(message.action==='voice.ptt' && typeof message.held === 'boolean') {
        pttDown=message.held; dispatchInputHoldAction('voice.ptt', message.held); return
      }
      const allowed:readonly string[] = [...SETTABLE_COMMANDS,'ui.confirm','ui.back','ui.up','ui.down',
        'ui.left','ui.right','ui.previous','ui.next','skill.slot1','skill.slot2','skill.slot3',
        'skill.slot4','skill.nextPage','map.panUp','map.panDown','map.panLeft','map.panRight',
        'map.zoomIn','map.zoomOut','map.mode','map.select','qte.react']
      if(message.action && settingsRef.current.preference !== 'desktop' && allowed.includes(message.action))
        runAction(message.action as InputAction, undefined, true)
    }
    const native=(window as typeof window & {chrome?: {webview?: {addEventListener?: (type:string,listener:(event:{data?:unknown})=>void)=>void;removeEventListener?: (type:string,listener:(event:{data?:unknown})=>void)=>void}}}).chrome?.webview
    native?.addEventListener?.('message',bridge)
    const reset=()=>{pttArmed=false;releasePtt();previous.clear();times.clear();setLtHeld(false)}
    const onDevice=()=>{lastIndex=-1;reset();window.cancelAnimationFrame(frame);window.clearTimeout(idleTimer);tick()}
    const onPointer=(event:PointerEvent)=>{recordControllerPointerOrigin(event.target);lastControllerActionAt=-Infinity;if(settingsRef.current.preference==='auto')setLastInput('desktop')}
    const onKey=(event:KeyboardEvent)=>{
      if (document.documentElement.dataset.otmsArenaActive === 'true') return

      if(event.ctrlKey&&event.altKey&&event.code==='KeyG'&&(activeRef.current||wasConnected||new URLSearchParams(location.search).get('tv')==='1')){
        event.preventDefault();setSettings(value=>({...value,preference:value.preference==='controller'?'auto':'controller'}));return
      }
      // Escape sintético pode ter target=document; não reprocessar eventos
      // disparados por controllerFocus (evita recursão e TypeError).
      if(!event.isTrusted||!activeRef.current||event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return
      // O teclado do controle mantém o input de origem focado para impedir
      // que onBlur desmonte inputs numéricos. Mesmo assim, setas/Enter/Escape
      // precisam controlar o teclado virtual, não o input atrás do overlay.
      if (controllerKeyboardOpen()) {
        const virtualDirections:Record<string,InputAction>={ArrowUp:'ui.up',ArrowDown:'ui.down',ArrowLeft:'ui.left',ArrowRight:'ui.right',Enter:'ui.confirm',Escape:'ui.back'}
        const virtualAction=virtualDirections[event.key]
        if (virtualAction) {event.preventDefault();event.stopPropagation();runAction(virtualAction);return}
        if (event.key==='Backspace' || event.key==='Delete') {
          event.preventDefault();event.stopPropagation();handleControllerKeyboardButton(event.key==='Delete'?'Y':'X');return
        }
      }
      const editing=isEditableKeyboardTarget(event.target)
      if(editing && event.key!=='Escape') {if(settingsRef.current.preference==='auto')setLastInput('desktop');return}
      const mapping:Record<string,InputAction>={ArrowUp:'ui.up',ArrowDown:'ui.down',ArrowLeft:'ui.left',ArrowRight:'ui.right',Enter:'ui.confirm',Escape:'ui.back',Backspace:'ui.back'}
      const action=mapping[event.key]
      if(action){event.preventDefault();if(!event.repeat||action.startsWith('ui.'))runAction(action)}
      else if(event.code==='F2'&&authenticatedRef.current){event.preventDefault();setSettingsOpen(true)}
    }
    let lastFocusedElement: HTMLElement | null = null
    const markFocus=(event:FocusEvent)=>{
      if(document.documentElement.dataset.otmsArenaActive==='true')return
      const target=event.target
      if(target instanceof HTMLElement && activeRef.current){
        const changed = target !== lastFocusedElement
        lastFocusedElement = target
        document.querySelectorAll('[data-controller-focused="true"]').forEach(el=>el.removeAttribute('data-controller-focused'))
        target.dataset.controllerFocused='true'
        rememberControllerFocus(target)
        // focusin can also be caused by a mouse click or Tab; the brief input
        // window ensures only a real controller-initiated focus move plays SFX.
        if(changed && settingsRef.current.soundFocus && performance.now() - lastControllerActionAt < 450)
          sounds.play('focus')
      }
    }
    window.addEventListener('blur',reset)
    window.addEventListener('gamepadconnected',onDevice)
    window.addEventListener('gamepaddisconnected',onDevice)
    window.addEventListener('pointerdown',onPointer,true)
    window.addEventListener('keydown',onKey,true)
    document.addEventListener('focusin',markFocus)
    document.addEventListener('visibilitychange',reset)
    tick()
    return()=>{
      releasePtt()
      window.cancelAnimationFrame(frame);window.clearTimeout(idleTimer)
      window.removeEventListener('blur',reset);window.removeEventListener('gamepadconnected',onDevice);window.removeEventListener('gamepaddisconnected',onDevice)
      window.removeEventListener('pointerdown',onPointer,true);window.removeEventListener('keydown',onKey,true)
      document.removeEventListener('focusin',markFocus);document.removeEventListener('visibilitychange',reset)
      native?.removeEventListener?.('message',bridge)
      sounds.dispose()
    }
  }, [])

  const value:ControllerContextValue={active,connected,name,ltHeld,page,settings,update,openSettings,availableButtons}
  return <ControllerContext.Provider value={value}>
    {children}
    <ControllerDialogs/>
    <ControllerStatus active={active} connected={connected} authenticated={authenticated} name={name} lastAction={lastAction} onOpen={openSettings}/>
    {authenticated && active && ltHeld && !settingsOpen && <div className="otms-controller-wheel-floating"><ControllerWheel settings={settings} page={page} skillNames={skillNames} skillChoices={skillChoices} specialChoices={specialChoices} characterChoices={characterChoices}/></div>}
    {authenticated && settingsOpen && <ControllerStartMenu settings={settings} update={update} onClose={()=>setSettingsOpen(false)} page={page} skillNames={skillNames} skillChoices={skillChoices} specialChoices={specialChoices} characterChoices={characterChoices} menuTab={menuTab} onTabChange={setMenuTab} availableButtons={availableButtons} onCapture={requestCapture}/>}
  </ControllerContext.Provider>
}
