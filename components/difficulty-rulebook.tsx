"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, ChevronLeft, ChevronRight, Dices, LockKeyhole, Sigma, X } from "lucide-react"
import {
  analyzeDifficulty, diceMoments, difficultyTargets, exactSuccessProbability,
  type DifficultySettings,
} from "@/lib/dynamic-difficulty"

type Props = { settings: DifficultySettings; onClose: () => void; isGm: boolean }

const CHAPTERS = [
  { title: "O problema", subtitle: "Por que a dificuldade fixa envelhece" },
  { title: "A curva dos dados", subtitle: "Média, dispersão e Gauss" },
  { title: "Os cinco limiares", subtitle: "De Falha crítica a Extremo" },
  { title: "A elasticidade", subtitle: "O papel do λ e do σ" },
  { title: "O herói evolui", subtitle: "Testes mundanos e progressão" },
  { title: "O pacto da mesa", subtitle: "Exemplos e aplicação prática" },
] as const
const fmt = (n: number, digits = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: digits })
const TIER_K = [
  { label: "Falha crítica", k: "−1,40", text: "Aproximadamente os 8% resultados mais baixos", tone: "text-rose-400" },
  { label: "Fácil", k: "−0,67", text: "Cerca de 75% de sucesso na normal teórica", tone: "text-emerald-500" },
  { label: "Médio", k: "0", text: "Próximo de 50% de sucesso na normal teórica", tone: "text-sky-400" },
  { label: "Difícil", k: "+0,67", text: "Aproximadamente o quartil superior", tone: "text-amber-500" },
  { label: "Extremo", k: "+1,28", text: "Próximo dos 10% melhores resultados", tone: "text-purple-400" },
]

function GaussianGraph() {
  const width = 680, height = 240, left = 36, bottom = 203
  const xToPx = (x: number) => left + (x - 2) / 38 * 602
  const points = (faces: number[]) => {
    const { mean, deviation } = diceMoments(faces)
    return Array.from({ length: 153 }, (_, i) => {
      const x = 2 + i / 152 * 38
      const density = Math.exp(-((x - mean) ** 2) / (2 * deviation ** 2)) / (deviation * Math.sqrt(2 * Math.PI))
      return `${xToPx(x).toFixed(1)},${(bottom - density * 840).toFixed(1)}`
    }).join(" ")
  }
  return <div className="rounded-2xl border border-primary/20 bg-background/60 p-3">
    <svg role="img" aria-label="Curvas gaussianas aproximadas de 2d8 (estreita, média 9) e 2d20 (larga, média 21)" viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
      {[2, 10, 20, 30, 40].map(x => <g key={x}><line x1={xToPx(x)} x2={xToPx(x)} y1="14" y2={bottom} className="stroke-border" strokeDasharray="3 7" /><text x={xToPx(x)} y="225" fontSize="11" textAnchor="middle" className="fill-muted-foreground">{x}</text></g>)}
      <line x1={left} x2="638" y1={bottom} y2={bottom} className="stroke-muted-foreground" />
      <polyline points={points([8,8])} fill="none" className="stroke-emerald-500" strokeWidth="3.5" strokeLinejoin="round" />
      <polyline points={points([20,20])} fill="none" className="stroke-primary" strokeWidth="3.5" strokeLinejoin="round" />
      <text x={xToPx(9)} y="19" className="fill-emerald-500" fontSize="12" textAnchor="middle">2d8 · μ=9</text>
      <text x={xToPx(27)} y="112" className="fill-primary" fontSize="12" textAnchor="middle">2d20 · μ=21</text>
    </svg>
    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Curvas normais aproximadas na mesma escala de resultado. A distribuição exata de poucos dados é discreta, mas a média e a variância calculadas são exatas.</p>
  </div>
}

function ProgressChart({ settings }: { settings: DifficultySettings }) {
  const values = useMemo(() => [8,10,12,14,16,18,20].map(faces => {
    const pool = [faces, faces]
    const fixed = difficultyTargets(diceMoments([8,8])).medium
    const pure = analyzeDifficulty(pool, 0, 1).targets.medium
    const elastic = analyzeDifficulty(pool, 0, settings).targets.medium
    return { faces, fixed: exactSuccessProbability(pool, fixed) * 100,
      pure: exactSuccessProbability(pool, pure) * 100,
      elastic: exactSuccessProbability(pool, elastic) * 100, elasticDC: elastic }
  }), [settings.lambda, settings.sigmaMultiplier])
  const w = 650, h = 255, top = 20, bottom = 210
  const x = (index: number) => 43 + index / 6 * 580
  const y = (percent: number) => bottom - percent / 100 * (bottom-top)
  const line = (key: "fixed" | "pure" | "elastic") => values.map((v,i) => `${x(i)},${y(v[key])}`).join(" ")
  return <div className="rounded-2xl border border-primary/25 bg-background/60 p-3">
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-semibold">
      <span className="text-rose-400">━ DC fixa 2d8</span><span className="text-sky-400">━ Escala total (λ=1)</span><span className="text-primary">━ Escala da campanha</span>
    </div>
    <svg role="img" aria-label="Gráfico de chance exata de superar dificuldade Média para 2d8 até 2d20: dificuldade fixa sobe perto de 100%, escala total permanece perto de 50%, escala elástica sobe moderadamente." className="h-auto w-full" viewBox={`0 0 ${w} ${h}`}>
      {[0,25,50,75,100].map(p => <g key={p}><line x1="43" x2="623" y1={y(p)} y2={y(p)} className="stroke-border" strokeDasharray="4 6"/><text x="36" y={y(p)+3} textAnchor="end" className="fill-muted-foreground" fontSize="10">{p}%</text></g>)}
      {values.map((v,i) => <text key={v.faces} x={x(i)} y="237" fontSize="11" textAnchor="middle" className="fill-muted-foreground">d{v.faces}</text>)}
      <polyline points={line("fixed")} className="stroke-rose-400" strokeWidth="3" fill="none" strokeLinejoin="round"/>
      <polyline points={line("pure")} className="stroke-sky-400" strokeWidth="3" fill="none" strokeLinejoin="round"/>
      <polyline points={line("elastic")} className="stroke-primary" strokeWidth="4" fill="none" strokeLinejoin="round"/>
      {values.map((v,i)=><circle key={v.faces} cx={x(i)} cy={y(v.elastic)} r="4.5" className="fill-primary stroke-background" strokeWidth="2"/>)}
    </svg>
    <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[420px] text-center text-[11px] tabular-nums"><thead><tr className="text-muted-foreground"><th className="py-1 text-left">Parada</th>{values.map(v => <th key={v.faces}>2d{v.faces}</th>)}</tr></thead><tbody><tr className="border-t border-border/40"><th className="py-1.5 text-left">Chance elástica</th>{values.map(v => <td key={v.faces} className="font-semibold text-primary">{Math.round(v.elastic)}%</td>)}</tr><tr className="border-t border-border/40"><th className="py-1.5 text-left">DC média elástica</th>{values.map(v => <td key={v.faces}>{v.elasticDC}</td>)}</tr></tbody></table></div>
    <p className="mt-2 text-[11px] text-muted-foreground">Probabilidades <strong>exatas</strong> para 2 dados sem modificadores, calculadas pela distribuição discreta. O gráfico usa Médio como exemplo; resultados mudam com λ e com o total final do teste.</p>
  </div>
}

export function DifficultyRulebook({ settings, onClose, isGm }: Props) {
  const [page, setPage] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const headingId = "difficulty-rulebook-heading"
  useEffect(() => {
    const previous = document.body.style.overflow
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return }
      if (event.key === "ArrowRight" && !(event.target instanceof HTMLInputElement)) setPage(v => Math.min(CHAPTERS.length-1,v+1))
      if (event.key === "ArrowLeft" && !(event.target instanceof HTMLInputElement)) setPage(v => Math.max(0,v-1))
      if (event.key !== "Tab" || !dialogRef.current) return
      const elements = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0)
      if (!elements.length) return
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements[elements.length-1].focus() }
      else if (!event.shiftKey && document.activeElement === elements[elements.length-1]) { event.preventDefault(); elements[0].focus() }
    }
    document.addEventListener("keydown",key)
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", key); before?.focus() }
  }, [onClose])
  useEffect(() => { pageRef.current?.scrollTo({ top:0, behavior:"auto" }) }, [page])
  const sampleLow = analyzeDifficulty([8,8], 9, settings)
  const sampleHigh = analyzeDifficulty([20,20], 26, settings)
  const chapter = CHAPTERS[page]
  return <div ref={dialogRef} className="rpg-themed-workspace fixed inset-0 z-[13000] flex flex-col bg-background/98 text-foreground backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby={headingId}>
    <header className="flex shrink-0 items-center justify-between border-b border-primary/25 bg-card/85 px-4 py-3 sm:px-8">
      <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/10 text-primary"><BookOpen className="size-5"/></span><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-primary">Compêndio da campanha</p><h2 id={headingId} className="font-serif text-lg font-black sm:text-2xl">A arte da dificuldade elástica</h2></div></div>
      <button ref={closeRef} type="button" onClick={onClose} className="grid size-10 place-items-center rounded-lg border border-border/60 hover:bg-primary/10" aria-label="Fechar livro"><X className="size-5"/></button>
    </header>
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-5 lg:p-7">
      <div className="grid h-full max-h-[850px] w-full max-w-[1160px] grid-cols-1 overflow-hidden rounded-2xl border border-primary/35 bg-card shadow-[0_25px_100px_rgba(0,0,0,.35)] lg:grid-cols-[34%_66%]">
        <aside className="hidden overflow-y-auto border-r-2 border-primary/25 bg-primary/[.055] p-7 lg:flex lg:flex-col">
          <span className="font-serif text-sm font-bold uppercase tracking-[.25em] text-primary">Livro das regras</span>
          <h3 className="mt-7 font-serif text-3xl font-black leading-tight">Dificuldades que acompanham o herói, sem apagar sua evolução.</h3>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Descubra por que os números crescem, de onde surgem os limites e por que uma armadilha simples não precisa ser um sucesso automático para sempre.</p>
          <div className="my-7 h-px bg-border"/>
          <nav aria-label="Índice do livro" className="space-y-1">
            {CHAPTERS.map((c,i) => <button key={c.title} type="button" aria-current={i===page ? "page" : undefined} onClick={()=>setPage(i)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors ${i===page ? "border border-primary/35 bg-primary/15 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"}`}><span className="font-mono font-black">{String(i+1).padStart(2,"0")}</span><span>{c.title}</span></button>)}
          </nav>
          <div className="mt-auto rounded-xl border border-primary/20 bg-background/45 p-4 text-xs leading-relaxed text-muted-foreground"><LockKeyhole className="mb-2 size-4 text-primary"/>As regras de rolagem não mudam. Este guia interpreta o resultado final para comparação; só o Mestre altera os parâmetros.</div>
        </aside>
        <div ref={pageRef} className="min-h-0 overflow-y-auto bg-background/60 p-5 sm:p-9 lg:p-11 [scrollbar-color:rgba(160,125,71,.4)_transparent]">
          <div className="flex items-center justify-between border-b border-primary/20 pb-4"><span className="text-[10px] font-black uppercase tracking-[.2em] text-primary">Capítulo {String(page+1).padStart(2,"0")}</span><span className="font-mono text-[10px] text-muted-foreground">{page+1} / {CHAPTERS.length}</span></div>
          <h3 className="mt-6 font-serif text-3xl font-black leading-tight sm:text-4xl">{chapter.title}</h3>
          <p className="mb-7 mt-2 text-sm text-muted-foreground">{chapter.subtitle}</p>
          <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
            {page===0 && <>
              <p>Uma tabela de dificuldade <strong>fixa</strong> funciona apenas enquanto o poder dos personagens está perto do patamar em que ela foi concebida. Um aventureiro com 2d8 e outro com 2d20 não enfrentam a mesma probabilidade contra um alvo numérico imutável.</p>
              <div className="grid gap-3 sm:grid-cols-2">{[
                { name:"Iniciante · 2d8", value:exactSuccessProbability([8,8],9)*100 },
                { name:"Veterano · 2d20", value:exactSuccessProbability([20,20],9)*100 },
              ].map(row => <div key={row.name} className="rounded-xl border border-primary/25 bg-primary/[.06] p-4"><div className="text-xs text-muted-foreground">{row.name} · DC fixa 9</div><div className="mt-2 font-serif text-3xl font-black text-primary">{fmt(row.value)}%</div><div className="mt-1 text-[11px] text-muted-foreground">chance exata de sucesso, sem bônus</div></div>)}</div>
              <p>Uma ação mundana muito fácil tende a deixar de produzir tensão quando o personagem evolui. Mas escalar cada DC na mesma proporção que a parada elimina a recompensa mecânica de conquistar dados melhores.</p>
              <div className="rounded-xl border-l-4 border-primary bg-primary/10 p-5"><strong>O compromisso do sistema:</strong> elevar uma parte da dificuldade com o poder do herói, mas deixar outra parte como vantagem de evolução. Essa fração é o parâmetro λ (lambda).</div>
              <p>Este livro explica as fórmulas e as suas consequências. O Mestre continua podendo definir a dificuldade narrativa da cena; a tabela é um guia comparativo, não uma decisão automática sobre a ficção.</p>
            </>}
            {page===1 && <>
              <p>Para cada dado justo com <strong>f</strong> faces, a média é <strong>(f + 1)/2</strong> e a variância é <strong>(f² − 1)/12</strong>. Para dados independentes, as médias e as variâncias se somam.</p>
              <div className="rounded-xl border border-primary/30 bg-primary/[.055] p-5 text-center font-serif text-xl sm:text-2xl"><p>μ = Σ (fᵢ + 1) / 2</p><p className="mt-3">σ = √ Σ (fᵢ² − 1) / 12</p></div>
              <GaussianGraph/>
              <p>Uma combinação de <strong>2d8</strong> tem μ = 9 e σ ≈ 3,24. Já <strong>2d20</strong> tem μ = 21 e σ ≈ 8,15. Jogar dados maiores aumenta simultaneamente o centro e a dispersão dos resultados.</p>
              <p>O teorema do limite central explica a aproximação por uma curva de Gauss conforme adicionamos dados. Com dois ou três dados, <strong>não</strong> é uma distribuição normal exata: arredondamentos e resultados inteiros alteram as probabilidades reais.</p>
            </>}
            {page===2 && <>
              <p>A dificuldade utiliza <strong>DC = arredondar(μ efetiva + k × σ efetivo)</strong>. O fator <strong>k</strong> define o afastamento do centro para cinco referências:</p>
              <div className="grid gap-2">{TIER_K.map(t => <div key={t.label} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 p-3"><span className={`w-20 shrink-0 font-mono text-lg font-black ${t.tone}`}>{t.k}</span><div><p className="font-bold">{t.label}</p><p className="text-[11px] text-muted-foreground">{t.text}</p></div></div>)}</div>
              <div className="overflow-x-auto rounded-xl border border-border/60"><table className="w-full min-w-[450px] text-center text-xs"><thead className="bg-primary/10"><tr><th className="p-3 text-left">Parada</th><th>F. crítica ≤</th><th>Fácil</th><th>Médio</th><th>Difícil</th><th>Extremo +</th></tr></thead><tbody>{[[8,8],[12,12],[20,20]].map(sides=>{const t=difficultyTargets(diceMoments(sides));return <tr key={sides[0]} className="border-t border-border/45"><th className="p-3 text-left">2d{sides[0]}</th><td>{t.critical}</td><td>{t.easy}</td><td>{t.medium}</td><td>{t.hard}</td><td>{t.extreme}</td></tr>})}</tbody></table></div>
              <p>Esses valores são <strong>referências gaussianas puras</strong> (sem amortecimento do mundo). O guia da campanha usa a versão elástica configurada pelo Mestre. O limiar de Falha crítica é uma <em>classificação informativa</em> do guia e não redefine regras existentes de falha crítica.</p>
            </>}
            {page===3 && <>
              <p>Um mundo que sempre ajusta tudo para o personagem faz um D20 parecer igual a um D8. O parâmetro <strong>λ</strong> define quanto do progresso é absorvido pelas dificuldades.</p>
              <div className="rounded-xl border border-primary/25 bg-primary/[.06] p-5 font-mono text-xs leading-loose sm:text-sm"><p>μ efetiva = μ base + λ(μ jogador − μ base)</p><p>σ interpolado = σ base + λ(σ jogador − σ base)</p><p>σ efetivo = σ interpolado × fator σ</p><p>DC = arredondar(μ efetiva + k × σ efetivo)</p></div>
              <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border/50 p-4"><div className="text-[11px] text-muted-foreground">Parâmetro atual · λ</div><div className="mt-1 font-mono text-3xl font-black text-primary">{fmt(settings.lambda,2)}</div><p className="mt-2 text-xs text-muted-foreground">0 = mundo-base estável; 1 = escala proporcional completa. O padrão é 0,6.</p></div><div className="rounded-xl border border-border/50 p-4"><div className="text-[11px] text-muted-foreground">Influência de σ atual</div><div className="mt-1 font-mono text-3xl font-black text-primary">{fmt(settings.sigmaMultiplier,2)}×</div><p className="mt-2 text-xs text-muted-foreground">Alarga ou estreita a distância entre Fácil, Médio, Difícil e Extremo. Não muda o σ estatístico dos dados.</p></div></div>
              <p>O mundo-base usa <strong>2d8</strong> para ação comum, <strong>3d8</strong> para alta tensão e <strong>4d10</strong> para lendário. Para paradas maiores, aplica-se a mesma referência d10 a cada dado.</p>
              <p>Com λ = 0,6, um jogador de 2d20 desloca a média-base 9 para <strong>16,2</strong> (em vez de 21). Isso protege desafios comuns de perder toda relevância, sem apagar a vantagem estatística do personagem mais forte.</p>
            </>}
            {page===4 && <>
              <p>O gráfico compara a chance de alcançar a dificuldade <strong>Média</strong>, com uma parada avançando de 2d8 para 2d20. Em cada ponto, as chances foram calculadas pela soma exata dos dados, sem arredondar probabilidades gaussianas.</p>
              <ProgressChart settings={settings}/>
              <p><strong>DC fixa</strong> permanece em 9 e se torna fácil demais quando o herói cresce. <strong>Escala completa</strong> mantém chance perto de 50%, anulando grande parte da progressão. <strong>Escala elástica</strong> (λ da campanha) eleva a DC parcialmente; em geral, o personagem evoluído passa com mais frequência, mas testes ainda podem falhar.</p>
              <p>O equilíbrio final depende da composição da parada e de bônus. λ = 1 não é idêntico a probabilidades fixas por causa de dados discretos; λ = 0,6 também não é garantia universal. A tabela oferece comparação coerente, não uma probabilidade imutável.</p>
            </>}
            {page===5 && <>
              <p>O guia observa a <strong>parada real</strong> (por exemplo, d10+d6) e compara o <strong>resultado final</strong>, já incluindo bônus, penalidades e modificadores. Os alvos são calculados pelas faces dos dados, não pelos valores que saíram.</p>
              <div className="grid gap-3 sm:grid-cols-2">{[
                { name:"Ação comum · 2d8", a:sampleLow, total:9 },
                { name:"Herói evoluído · 2d20", a:sampleHigh, total:26 },
              ].map(({name,a,total})=><div key={name} className="rounded-xl border border-primary/25 bg-card/45 p-4"><h4 className="font-bold">{name}</h4><p className="mt-1 text-[11px] text-muted-foreground">Resultado final {total}</p><div className="mt-3 grid grid-cols-4 gap-1 text-center text-[10px]">{[["Fácil",a.targets.easy],["Médio",a.targets.medium],["Difícil",a.targets.hard],["Extremo",a.targets.extreme]].map(([name,val])=><div key={name} className="rounded-md border border-primary/20 bg-primary/10 p-1.5"><span className="block font-mono text-lg font-black text-primary">{val}</span>{name}</div>)}</div></div>)}</div>
              <div className="rounded-xl border border-primary/30 bg-primary/[.07] p-4"><Sigma className="mb-2 size-5 text-primary"/><p className="font-bold">Governança da campanha</p><p className="mt-2">Os valores atuais são λ = <strong>{fmt(settings.lambda,2)}</strong> e fator σ = <strong>{fmt(settings.sigmaMultiplier,2)}×</strong>. {isGm ? "O Mestre pode editá-los no Guia de Dificuldade. Alterações confirmadas pelo banco valem nas próximas rolagens." : "Somente o Mestre pode modificá-los; jogadores recebem os novos limites automaticamente."}</p></div>
              <p>O modelo <strong>não modifica dados lançados, pontos de personagem, crítico tradicional, dano ou sucesso declarado pelo Mestre</strong>. Ele acrescenta uma régua adaptativa transparente ao resultado do RPG. Pequenos empates de limiares podem ocorrer por arredondamento, sobretudo em paradas de poucos dados.</p>
            </>}
          </div>
          <div className="mt-9 border-t border-primary/20 pt-4 text-right font-serif text-sm italic text-muted-foreground">Folha {page+1} de {CHAPTERS.length} · Compêndio de dificuldade</div>
        </div>
      </div>
    </div>
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-primary/25 bg-card/90 px-4 py-3 sm:px-8">
      <button type="button" disabled={page===0} onClick={()=>setPage(p=>p-1)} className="inline-flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-xs font-bold disabled:opacity-35 hover:border-primary/45"><ChevronLeft className="size-4"/>Anterior</button>
      <div className="hidden items-center gap-2 sm:flex">{CHAPTERS.map((_,i)=><button type="button" key={i} aria-label={`Ir à página ${i+1}`} aria-current={page===i?"page":undefined} onClick={()=>setPage(i)} className={`size-2.5 rounded-full transition-all ${page===i?"bg-primary scale-125":"bg-muted-foreground/30 hover:bg-primary/50"}`}/>)}</div>
      <span className="font-mono text-xs text-muted-foreground sm:hidden">{page+1} / {CHAPTERS.length}</span>
      <button type="button" onClick={()=>page===CHAPTERS.length-1?onClose():setPage(p=>p+1)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">{page===CHAPTERS.length-1?"Concluir":"Próxima"}<ChevronRight className="size-4"/></button>
    </footer>
  </div>
}
    