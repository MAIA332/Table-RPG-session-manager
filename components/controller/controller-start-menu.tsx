'use client'
import { useEffect, useRef, useState } from 'react'
import { BookOpen, Gamepad2, LayoutGrid, SlidersHorizontal, X, Keyboard, CircleHelp, RotateCcw, Disc3 } from 'lucide-react'
import { BASE_COMMANDS, DEFAULT_BINDINGS, DEFAULT_SETTINGS, REMAPPABLE_BUTTONS, REMAPPABLE_LT_BUTTONS, MAX_SKILL_PAGES, SETTABLE_COMMANDS, type GamepadButtonName, type InputAction, type InputSettings } from '@/lib/input/actions'
import { ACTION_LABELS } from '@/lib/input/labels'
import { ControllerGlyph } from './controller-glyph'
import { ControllerWheel } from './controller-wheel'
import { ControllerActionPicker } from './controller-action-picker'
import type { ControllerTarget } from '@/lib/input/targeted-actions'
import { listPanelCommands, labelForPanelAction, type PanelCommand } from '@/lib/input/panel-actions'
import { SOUND_ACTIONS, SOUND_ACTION_LABELS, SOUNDPAD_BUTTONS, DEFAULT_SOUNDPAD_BINDINGS, type SoundAction } from '@/lib/input/soundpad-commands'

const TABS = [
  { key: 'bindings', name: 'Comandos', icon: Gamepad2 },
  { key: 'wheel', name: 'Atalhos LT', icon: LayoutGrid },
  { key: 'soundpad', name: 'Soundpad', icon: Disc3 },
  { key: 'options', name: 'Acessibilidade', icon: SlidersHorizontal },
  { key: 'help', name: 'Ajuda', icon: BookOpen },
] as const
export type ControllerMenuTab = typeof TABS[number]['key']
const BUTTONS = ['A', 'B', 'X', 'Y'] as const
interface Props {
  settings: InputSettings; update: (patch: Partial<InputSettings>) => void
  onClose: () => void; page: number; skillNames: string[]; skillChoices: ControllerTarget[]; specialChoices: ControllerTarget[]; characterChoices: ControllerTarget[]; menuTab: ControllerMenuTab
  onTabChange: (tab: ControllerMenuTab) => void
  availableButtons: GamepadButtonName[]
  onCapture: (action: InputAction) => void
}

export function ControllerStartMenu({ settings, update, onClose, page, skillNames, skillChoices, specialChoices, characterChoices, menuTab, onTabChange, availableButtons, onCapture }: Props) {
  const [editingPage, setEditingPage] = useState(page)
  useEffect(() => setEditingPage(current => Math.min(current, settings.slots.length - 1)), [settings.slots.length])
  const [panelCommands, setPanelCommands] = useState<PanelCommand[]>([])
  useEffect(()=>setPanelCommands(listPanelCommands()),[])
  const directCommands = [...BASE_COMMANDS, ...panelCommands.map(c=>c.action)]
  const wheelCommands = [...SETTABLE_COMMANDS, ...panelCommands.map(c=>c.action)]
  const actionLabel=(action:InputAction)=>ACTION_LABELS[action] || labelForPanelAction(action)
  const [captureAction, setCaptureAction] = useState<InputAction | null>(null)
  const buttons = [...REMAPPABLE_BUTTONS, ...availableButtons.filter(button => /^BTN(?:1[6-9]|[2-5]\d|6[0-3])$/.test(button)), ...REMAPPABLE_LT_BUTTONS]
  useEffect(() => {
    const onCaptured = (event: Event) => {
      const {action, button} = (event as CustomEvent<{action:InputAction,button:GamepadButtonName | `LT+${GamepadButtonName}`}>).detail
      if (button !== 'B') update({buttonBindings:{...settings.buttonBindings,[button]:action}})
      setCaptureAction(null)
    }
    window.addEventListener('otms.controller.captured',onCaptured)
    return () => window.removeEventListener('otms.controller.captured',onCaptured)
  }, [settings.buttonBindings, update])
  const startCapture = (action: InputAction) => {setCaptureAction(action);onCapture(action)}
  const sectionRef = useRef<HTMLElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    requestAnimationFrame(() => sectionRef.current?.querySelector<HTMLButtonElement>('[data-controller-tab-active="true"]')?.focus({ preventScroll: true }))
    return () => { restoreFocus.current?.focus({ preventScroll: true }) }
  }, [])
  useEffect(() => {
    sectionRef.current?.querySelector<HTMLButtonElement>('[data-controller-tab-active="true"]')?.focus({preventScroll:true})
  }, [menuTab])
  return <div className="otms-start-backdrop" data-controller-layer="active" onPointerDown={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section ref={sectionRef} role="dialog" aria-modal="true" aria-labelledby="otms-controller-settings-title" className="otms-start-menu"
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }}>
      <header className="otms-start-header">
        <div className="otms-start-eyebrow">OVER THE MAGIC SCHOOL <span> / </span> CONTROLE</div>
        <div className="otms-start-heading"><h2 id="otms-controller-settings-title">CONFIGURAÇÕES</h2>
          <button className="otms-start-close" aria-label="Fechar configurações" onClick={onClose}><ControllerGlyph button="B" small /> Voltar <X size={17}/></button>
        </div>
        <p>Personalize seus comandos sem alterar a experiência de quem usa mouse ou teclado.</p>
      </header>
      <div className="otms-start-layout">
        <nav className="otms-start-tabs" aria-label="Páginas das configurações">
          {TABS.map(({key, name, icon: Icon}) => <button key={key} type="button" data-controller-tab-active={menuTab === key}
            aria-current={menuTab === key ? 'page' : undefined} onClick={() => onTabChange(key)}>
            <Icon size={18}/><span>{name}</span><i aria-hidden="true"/>
          </button>)}
          <div className="otms-start-nav-help"><ControllerGlyph button="LB" small/> / <ControllerGlyph button="RB" small/> mudar página</div>
        </nav>
        <main className="otms-start-body" id="otms-controller-main">
          {menuTab === 'bindings' && <>
            <div className="otms-start-section-header"><h3>MAPEAMENTO DIRETO</h3><span>Atalhos de um botão</span></div>
            <p className="otms-start-description">Escolha ações para LB, RB e demais botões disponíveis. As ações do Mestre verificam as permissões da sessão. Os botões extras aparecem automaticamente quando o navegador os expõe individualmente.</p>
            <div className="otms-controller-device-info"><Gamepad2 size={18}/><span>{availableButtons.length ? `${availableButtons.length} botões detectados no controle` : 'Conecte e pressione qualquer botão para reconhecer o dispositivo'}</span></div>
            {captureAction && <div className="otms-controller-capture" role="status">Pressione no controle o botão para <strong>{actionLabel(captureAction)}</strong>. B cancela.</div>}
            {panelCommands.length > 0 && <p className="otms-start-note">{panelCommands.length} comandos dos painéis da sala detectados automaticamente, incluindo ações específicas dos botões visíveis à sua conta.</p>}
            <div className="otms-start-mappings">
              {buttons.map(button => <div key={button} className="otms-start-mapping-row">
                <span className="otms-start-binding-button"><ControllerGlyph button={button} /> <strong>{button === 'LS' ? 'L3' : button === 'RS' ? 'R3' : button === 'LT+LS' ? 'LT + L3' : button === 'LT+RS' ? 'LT + R3' : button}</strong></span>
                <ControllerActionPicker label={`Ação do botão ${button}`} value={settings.buttonBindings[button] || DEFAULT_BINDINGS[button] || ''}
                  commands={directCommands} skills={skillChoices} specials={specialChoices} characters={characterChoices} getLabel={actionLabel} includeEmpty={!DEFAULT_BINDINGS[button]}
                  onChange={value => {const next={...settings.buttonBindings}; if(value) next[button]=value; else delete next[button]; update({buttonBindings:next})}} />
                <button type="button" className="otms-controller-capture-btn" disabled={!settings.buttonBindings[button] && !DEFAULT_BINDINGS[button]} onClick={() => startCapture((settings.buttonBindings[button] || DEFAULT_BINDINGS[button] || 'ui.next') as InputAction)} aria-label={`Detectar botão físico para ${actionLabel((settings.buttonBindings[button] || DEFAULT_BINDINGS[button] || 'ui.next') as InputAction)}`}>Detectar</button>
              </div>)}
            </div>
            <p className="otms-start-note">L3/R3 e LT+L3/LT+R3 podem ter ações independentes. A, B, MENU, LT e direcional permanecem reservados à navegação. Para botões extras, o navegador precisa disponibilizar um índice independente; paddles espelhados não são distinguíveis.</p>
            <button className="otms-start-secondary" onClick={() => update({buttonBindings:{}})}><RotateCcw size={16}/> Restaurar atalhos diretos</button>
          </>}
          {menuTab === 'wheel' && <>
            <div className="otms-start-section-header"><h3>RODA DE ATALHOS</h3><span>Segure LT durante o jogo</span></div>
            <p className="otms-start-description">Configure até cinco conjuntos de quatro ações. Segure LT para exibir o radial e use LT + RB para alternar entre eles. L3/R3 e LT + L3/R3 são configuráveis na aba Comandos.</p>
            <div className="otms-wheel-editor">
              <ControllerWheel settings={settings} page={editingPage} skillNames={skillNames} skillChoices={skillChoices} specialChoices={specialChoices} characterChoices={characterChoices} preview />
              <div className="otms-wheel-editor-fields">
                <div className="otms-wheel-page-picker">{settings.slots.map((_, i) => <button key={i} aria-pressed={editingPage===i} onClick={() => setEditingPage(i)}>Conjunto {i+1}</button>)}{settings.slots.length < MAX_SKILL_PAGES && <button type="button" aria-label="Adicionar conjunto LT" onClick={() => { const next = [...settings.slots, [...DEFAULT_SETTINGS.slots[0]]]; update({slots: next}); setEditingPage(next.length-1) }}>+ Novo conjunto</button>}{settings.slots.length > 1 && <button type="button" aria-label="Remover conjunto LT atual" onClick={() => {update({slots:settings.slots.filter((_,i)=>i!==editingPage)});setEditingPage(Math.max(0,editingPage-1))}}>− Remover</button>}</div>
                {settings.slots[editingPage].map((action, index) => <label key={index} className="otms-start-mapping-row">
                  <span className="otms-start-binding-button"><ControllerGlyph button={BUTTONS[index]} /><strong>{BUTTONS[index]}</strong></span>
                  <ControllerActionPicker label={`LT mais ${BUTTONS[index]}`} value={action} commands={wheelCommands}
                    skills={skillChoices} specials={specialChoices} characters={characterChoices} getLabel={actionLabel}
                    onChange={value => {if(value) update({slots:settings.slots.map((slot,p)=>p!==editingPage?slot:slot.map((previous,j)=>index===j?value:previous))})}} />
                </label>)}
              </div>
            </div>
            <p className="otms-start-note">Habilidades e golpes são filtrados pelo personagem que você controla. Ao escolher uma dessas ações, o segundo seletor indica o alvo específico. Selecionar habilidade abre sua ficha para confirmação. O radial nunca consome MP automaticamente.</p>
            <button className="otms-start-secondary" onClick={() => update({slots: DEFAULT_SETTINGS.slots.map(row=>[...row])})}><RotateCcw size={16}/> Restaurar conjuntos</button>
          </>}
          {menuTab === 'soundpad' && <>
            <div className="otms-start-section-header"><h3>CONTROLES DO SOUND STUDIO</h3><span>Perfil exclusivo da tela cheia</span></div>
            <p className="otms-start-description">Enquanto o Arquivo Sonoro estiver aberto, estes botões substituem os atalhos da campanha. Ao fechar o estúdio, os mapeamentos normais voltam automaticamente. A, B, MENU e o direcional continuam reservados à navegação.</p>
            <div className="otms-start-mappings">
              {[...SOUNDPAD_BUTTONS, ...availableButtons.filter(button => /^BTN(?:1[6-9]|[2-5]\d|6[0-3])$/.test(button))].map(button => (
                <label key={button} className="otms-start-mapping-row">
                  <span className="otms-start-binding-button"><ControllerGlyph button={button as GamepadButtonName | `LT+${GamepadButtonName}`} /><strong>{button.replace('LS', 'L3').replace('RS', 'R3')}</strong></span>
                  <select aria-label={`Comando de áudio para ${button}`} value={settings.soundpadBindings[button as keyof typeof settings.soundpadBindings] || ''}
                    onChange={event => update({soundpadBindings:{...settings.soundpadBindings,[button]:event.target.value as SoundAction | ''}})}>
                    <option value="">Sem ação</option>
                    {SOUND_ACTIONS.map(action => <option key={action} value={action}>{SOUND_ACTION_LABELS[action]}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <p className="otms-start-note">Padrão: X = Play/Pause · Y = Parar · LB/RB = faixa anterior/próxima · RT = Reproduzir · Select = Pausar. Alterações não afetam mouse/teclado. Fora do Soundpad, configure comandos de áudio na aba Comandos ou em Atalhos LT; o miniplayer mostrará os botões escolhidos.</p>
            <button type="button" className="otms-start-secondary" onClick={() => update({soundpadBindings:{...DEFAULT_SOUNDPAD_BINDINGS}})}><RotateCcw size={16}/> Restaurar botões do Soundpad</button>
          </>}
          {menuTab === 'options' && <>
            <div className="otms-start-section-header"><h3>ACESSIBILIDADE</h3><span>Preferências neste dispositivo</span></div>
            <div className="otms-start-options">
              <label>Modo de entrada <select value={settings.preference} onChange={event => update({preference:event.target.value as InputSettings['preference']})}>
                <option value="auto">Automático (último dispositivo)</option><option value="controller">Sempre modo controle</option><option value="desktop">Somente mouse e teclado</option>
              </select></label>
              <label>Zona morta dos analógicos <span>{Math.round(settings.deadzone*100)}%</span>
                <input type="range" min="0.12" max="0.90" step="0.01" value={settings.deadzone} onChange={e => update({deadzone:Number(e.target.value)})}/></label>
              <label>Repetição das setas <span>{settings.repeatMs}ms</span>
                <input type="range" min="85" max="400" step="5" value={settings.repeatMs} onChange={e => update({repeatMs:Number(e.target.value)})}/></label>
              <label className="otms-start-check"><input type="checkbox" checked={settings.tvScale} onChange={e => update({tvScale:e.target.checked})} /> Ampliar foco e botões no modo TV</label>
              <label className="otms-start-check"><input type="checkbox" checked={settings.vibration} onChange={e => update({vibration:e.target.checked})} /> Vibração discreta (ativada por padrão, quando compatível)</label>
              <label className="otms-start-check"><input type="checkbox" checked={settings.soundFocus} onChange={e => update({soundFocus:e.target.checked})} /> Som ao mudar o foco com o controle</label>
              <label className="otms-start-check"><input type="checkbox" checked={settings.soundClick} onChange={e => update({soundClick:e.target.checked})} /> Som ao confirmar ou executar opções com o controle</label>
              <p className="otms-start-note">Efeitos exclusivos do controle. O navegador pode exigir uma interação antes de liberar áudio; a reprodução depende de acesso aos arquivos sonoros.</p>
            </div>
          </>}
          {menuTab === 'help' && <>
            <div className="otms-start-section-header"><h3>COMANDOS ESSENCIAIS</h3><span>Guia rápido</span></div>
            <div className="otms-start-help">
              <div className="otms-start-controller-illustration"><Gamepad2 size={150} strokeWidth={0.85}/><div>CONTROLE XBOX / PC</div></div>
              <p><ControllerGlyph button="A"/> Confirmar ou selecionar o item em foco</p>
              <p><ControllerGlyph button="B"/> Fechar modal / voltar sem sair da campanha</p>
              <p><ControllerGlyph button="UP"/> <ControllerGlyph button="DOWN"/> Navegar, inclusive com o analógico esquerdo</p>
              <p><ControllerGlyph button="MENU"/> Abrir ou fechar este menu (somente após login)</p>
              <p><ControllerGlyph button="LEFT"/><ControllerGlyph button="RIGHT"/> Mover entre controles. Em seletores, A abre a lista; setas escolhem e A confirma.</p>
              <p><ControllerGlyph button="LT"/> Segurar para exibir a roda de atalhos</p>
              <p><ControllerGlyph button="LT"/> + <ControllerGlyph button="RB"/> Próximo conjunto de habilidades</p>
              <p><ControllerGlyph button="LS"/> / <ControllerGlyph button="RS"/> Ações personalizadas, inclusive segurando LT</p>
              <p>Arquivo Sonoro aberto: perfil próprio na aba Soundpad (X Play/Pause, Y Parar, LB/RB navegar faixas). No miniplayer valem somente os atalhos configurados em Comandos/Atalhos LT.</p>
              <p><ControllerGlyph button="VIEW"/> Select: personalizável; se houver uma imagem de golpe ativa para o Mestre, encerra primeiro a imagem.</p>
              <p>Maximizar vida e mana: use o segundo seletor para escolher um personagem seu quando houver mais de um.</p>
              <p>Analógico direito: rolar verticalmente a página ou painel ativo</p>
              <p><Keyboard size={18}/> Se um campo de texto receber foco, digite normalmente com teclado ou teclado virtual do sistema.</p>
              <p><CircleHelp size={18}/> Ctrl + Alt + G alterna o modo de teste quando há controle ou ?tv=1.</p>
            </div>
          </>}
        </main>
      </div>
      <footer className="otms-start-footer"><span><ControllerGlyph button="A" small/> Selecionar</span><span><ControllerGlyph button="B" small/> Voltar</span><span><ControllerGlyph button="LB" small/> / <ControllerGlyph button="RB" small/> Páginas</span><span>Configurações salvas neste navegador</span></footer>
    </section>
  </div>
}
export const MENU_TABS = TABS.map(tab => tab.key)
