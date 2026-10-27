"use client"
import { useState } from "react"
import { PRESET_CHECKS, QTE_CHECKS } from "@/lib/combat-checks"
import type { CustomCheck } from "@/lib/custom-checks"
import type { MonsterAttribute } from "@/lib/monster-dice"
import { getEquipment } from "@/lib/game-data"
import type { Attack, Ability } from "@/lib/combat-model"
import type { CombatCreature } from "@/lib/combat-types"
export function CombatMonsterCard({
  creature,
  isGm,
  pending,
  canAct,
  targeting,
  onSelect,
  onAttack,
  onQte,
  onConfigure,
  onRemove,
  onVital,
  onAttributeRoll,
  onCheckRoll,
  onCustomCheckRoll,
  customChecks = [],
}: {
  creature: CombatCreature
  isGm: boolean
  pending: boolean
  canAct: boolean
  targeting: boolean
  onSelect: () => void
  onAttack: (index?: number, abilityId?: string) => void
  onQte: (id: string) => void
  onConfigure: () => void
  onRemove: () => void
  onAttributeRoll?: (attribute: MonsterAttribute) => void
  onCheckRoll?: (checkId: string) => void
  onCustomCheckRoll?: (check: CustomCheck) => void
  customChecks?: CustomCheck[]
  onVital: (
    resource: "currentHp" | "currentMp",
    change: number | "full",
  ) => void
}) {
  const button =
    "rounded-lg border border-white/15 px-3 py-2 text-left text-sm font-semibold transition hover:border-amber-300 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
  const abilities = creature.abilities || [],
    qtes = abilities.filter((a) => a.kind === "qte")
  if (!isGm)
    return (
      <button
        type="button"
        disabled={pending && targeting}
        onClick={onSelect}
        aria-label={
          targeting
            ? `Atacar ${creature.name}`
            : `Ampliar imagem de ${creature.name}`
        }
        className={`group relative aspect-[3/4] min-h-80 w-full overflow-hidden rounded-2xl border text-left shadow-xl sm:max-w-[440px] ${targeting ? "cursor-crosshair border-red-400 ring-2 ring-red-500/50" : "border-amber-400/20 hover:border-amber-300/60"}`}
      >
        <img
          src={creature.imageUrl || "/mystic-adventurer-portrait.png"}
          alt={creature.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
        />
      </button>
    )
  return (
    <article className="w-full rounded-2xl border border-amber-300/20 bg-zinc-950 p-4 text-white sm:max-w-[420px]">
      <header className="flex items-center gap-3">
        <button
          className="shrink-0"
          onClick={onSelect}
          aria-label={`Abrir ficha de ${creature.name}`}
        >
          <img
            src={creature.imageUrl || "/mystic-adventurer-portrait.png"}
            alt=""
            className="size-20 rounded-xl object-cover"
          />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-xl font-bold text-amber-100">
            {creature.name}
          </h3>
          <p className="text-xs text-zinc-400">
            Nível {creature.level} · {creature.species}
          </p>
        </div>
        <button
          className="p-2 text-zinc-400 hover:text-red-300"
          disabled={pending}
          aria-label={`Remover ${creature.name}`}
          onClick={onRemove}
        >
          ×
        </button>
      </header>
      <CreatureResourceControls
        creature={creature}
        pending={pending}
        onChange={onVital}
      />
      <CreatureSheetDetails creature={creature} onAttributeRoll={onAttributeRoll}
        onCheckRoll={onCheckRoll} onCustomCheckRoll={onCustomCheckRoll}
        customChecks={customChecks} rollPending={pending} />
      {!canAct && creature.currentHp > 0 && (
        <p className="mb-3 rounded-lg bg-amber-300/5 p-3 text-xs text-amber-200">
          Para atacar, inicie o combate e assuma o Holofote. Aguarde qualquer
          QTE em andamento.
        </p>
      )}
      <h4 className="mb-2 text-xs font-bold uppercase text-zinc-400">
        1. Escolha o ataque → 2. Clique no alvo
      </h4>
      <div className="grid gap-2">
        {(creature.basicAttacksV2 || []).map((a, i) => (
          <button
            className={button}
            key={i}
            disabled={pending || !canAct || creature.currentHp <= 0}
            onClick={() => onAttack(i)}
          >
            <span className="block text-amber-100">{a.name}</span>
            <CreatureAttackDetails attack={a} />
          </button>
        ))}
        {abilities
          .filter((a) => a.kind === "attack")
          .map(
            (a) =>
              a.kind === "attack" && (
                <button
                  className={`${button} border-violet-400/30`}
                  key={a.id}
                  disabled={pending || !canAct || creature.currentHp <= 0}
                  onClick={() => onAttack(undefined, a.id)}
                >
                  {a.name}
                  <CreatureAbilityDetails ability={a} />
                </button>
              ),
          )}
      </div>
      <section className="mt-4 rounded-xl border border-red-400/25 p-3">
        <h4 className="font-bold text-red-200">Reações de área · QTE</h4>
        <p className="my-2 text-xs text-zinc-400">
          Ao acionar, o cronômetro começa para os jogadores.
        </p>
        {qtes.length ? (
          qtes.map(
            (a) =>
              a.kind === "qte" && (
                <button
                  key={a.id}
                  className={`${button} mb-2 w-full border-red-400/40 bg-red-950/40`}
                  disabled={pending || !canAct || creature.currentHp <= 0}
                  onClick={() => onQte(a.id)}
                >
                  {a.name} · {a.seconds}s
                  <CreatureAbilityDetails ability={a} />
                </button>
              ),
          )
        ) : (
          <p className="mb-3 text-sm text-zinc-400">
            Nenhum QTE configurado nesta criatura.
          </p>
        )}
        <button
          className={`${button} w-full text-amber-200`}
          disabled={pending}
          onClick={onConfigure}
        >
          Configurar habilidades / QTE
        </button>
      </section>
      {abilities.some((a) => a.kind === "passive") && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-zinc-300">Passivas</summary>
          {abilities.map((a) =>
            a.kind === "passive" ? (
              <p key={a.id} className="mt-2 text-zinc-400">
                <strong>{a.name}</strong>
                <CreatureAbilityDetails ability={a} />
              </p>
            ) : null,
          )}
        </details>
      )}
    </article>
  )
}

export function CreatureResourceControls({
  creature,
  pending,
  onChange,
}: {
  creature: CombatCreature
  pending: boolean
  onChange: (
    resource: "currentHp" | "currentMp",
    change: number | "full",
  ) => void
}) {
  return (
    <div className="my-4 grid gap-3 sm:grid-cols-2">
      {(["currentHp", "currentMp"] as const).map((resource) => {
        const max = resource === "currentHp" ? creature.maxHp : creature.maxMp
        const value = creature[resource]
        const name = resource === "currentHp" ? "Vida" : "Mana"
        return (
          <section
            key={resource}
            aria-label={`Controlar ${name} de ${creature.name}`}
            className={`rounded-xl p-3 ${resource === "currentHp" ? "bg-red-950/40 text-red-100" : "bg-violet-950/40 text-violet-100"}`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{name}</span>
              <strong aria-live="polite">
                {value}/{max}
              </strong>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[-1, -2, -3, 1, 2, 3].map((delta) => (
                <button
                  type="button"
                  key={delta}
                  disabled={pending || (delta < 0 ? value <= 0 : value >= max)}
                  onClick={() => onChange(resource, delta)}
                  aria-label={`${delta > 0 ? "Adicionar" : "Remover"} ${Math.abs(delta)} de ${name}`}
                  className="min-h-9 rounded border border-white/20 bg-black/20 px-2 font-bold hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
              <button
                type="button"
                disabled={pending || value >= max}
                onClick={() => onChange(resource, "full")}
                className="col-span-3 min-h-9 rounded border border-white/20 px-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-35"
                aria-label={`Restaurar toda a ${name}`}
              >
                Full restore
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}


// Apresente estes detalhes apenas na visão do mestre.
export function CreatureAttackDetails({ attack }: { attack: Attack }) {
  return (
    <span className="mt-1 block space-y-1 text-xs font-normal text-zinc-300">
      <span className="block">Acerto: {attack.attributes.join(" + ").toUpperCase()} contra {attack.targetDefense === "magical" ? "Defesa Mágica" : "Defesa Física"}</span>
      <span className="block">Dano: {attack.damage} · {attack.type}</span>
      {attack.description && <span className="block whitespace-pre-wrap break-words">Efeito: {attack.description}</span>}
    </span>
  )
}

export function CreatureAbilityDetails({ ability }: { ability: Ability }) {
  if (ability.kind === "passive") return (
    <span className="mt-1 block space-y-1 whitespace-pre-wrap break-words text-xs font-normal text-zinc-300">
      <span className="block">Gatilho: {ability.trigger || "Não informado"}</span>
      <span className="block">Efeito: {ability.effect || "Não informado"}</span>
    </span>
  )
  const check = ability.kind === "qte" ? QTE_CHECKS.find(entry => entry.id === ability.checkId) : undefined
  return (
    <span className="mt-1 block space-y-1 text-xs font-normal text-zinc-300">
      <span className="block text-violet-200">Custo: {ability.cost.amount} {ability.cost.resource === "mp" ? "MP" : "Tokens de Ação"}</span>
      {ability.kind === "attack" ? <CreatureAttackDetails attack={ability.attack} /> : <>
        <span className="block">Reação: {ability.seconds}s · Dificuldade: {ability.difficulty}</span>
        <span className="block">Teste: {check ? `${check.name} (${check.attrs.join(" + ").toUpperCase()})` : ability.checkId}</span>
        <span className="block whitespace-pre-wrap break-words">Falha: {ability.failureDamage} de dano{ability.failureEffect ? ` · ${ability.failureEffect}` : ""}</span>
        <span className="block whitespace-pre-wrap break-words">Sucesso: {ability.successDamage} de dano{ability.successEffect ? ` · ${ability.successEffect}` : ""}</span>
      </>}
    </span>
  )
}

export function CreatureSheetDetails({ creature, onAttributeRoll, onCheckRoll, onCustomCheckRoll, customChecks = [], rollPending = false }: {
  creature: CombatCreature
  onAttributeRoll?: (attribute: MonsterAttribute) => void
  onCheckRoll?: (checkId: string) => void
  onCustomCheckRoll?: (check: CustomCheck) => void
  customChecks?: CustomCheck[]
  rollPending?: boolean
}) {
  const elements: Record<string, string> = { physical: "Físico", air: "Ar", bolt: "Raio", dark: "Trevas", earth: "Terra", fire: "Fogo", ice: "Gelo", light: "Luz", poison: "Veneno" }
  const affinityLabels: Record<string, string> = { none: "Normal", VU: "Vulnerável", RS: "Resistente", IM: "Imune", AB: "Absorve" }
  const affinities = creature.affinities || {}
  const affinityKeys = [...new Set([...Object.keys(elements), ...Object.keys(affinities)])]
  return (
    <section aria-label={`Propriedades de ${creature.name}`} className="my-4 space-y-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase text-amber-100">Atributos e defesas</h4>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["dex", "ins", "mig", "wlp"] as const).map(key => (
            <div key={key} className="rounded-lg bg-white/5 p-2 text-center">
              <dt className="text-xs uppercase text-zinc-400">{key}</dt>
              <dd className="font-bold text-amber-100">
                {onAttributeRoll ? (
                  <button type="button" disabled={rollPending}
                    onClick={() => onAttributeRoll(key)}
                    aria-label={`Rolar ${key.toUpperCase()} (${creature.attributes?.[key] || "dado"}) de ${creature.name}`}
                    title={`Rolar ${creature.attributes?.[key]} de ${creature.name}`}
                    className="w-full rounded-md border border-amber-400/30 p-1 font-bold transition hover:bg-amber-400/15 hover:text-amber-200 focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-40"
                  >
                    {creature.attributes?.[key] || "—"} <span aria-hidden="true" className="text-xs">🎲</span>
                  </button>
                ) : creature.attributes?.[key] || "—"}
              </dd>
            </div>
          ))}
          <div className="col-span-2 rounded-lg bg-white/5 p-2"><dt className="text-xs text-zinc-400">Defesa Física</dt><dd className="font-bold">{creature.def}</dd></div>
          <div className="col-span-2 rounded-lg bg-white/5 p-2"><dt className="text-xs text-zinc-400">Defesa Mágica</dt><dd className="font-bold">{creature.mdef}</dd></div>
        </dl>
      </div>
      {onCheckRoll && <CreatureChecksPanel creature={creature} disabled={rollPending}
        onRoll={onCheckRoll} customChecks={customChecks} onCustomRoll={onCustomCheckRoll} />}
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase text-amber-100">Afinidades</h4>
        <dl className="grid grid-cols-2 gap-2">
          {affinityKeys.map(key => { const value = affinities[key] || "none"; return <div key={key} className={`rounded-lg border p-2 ${value === "VU" ? "border-red-400/40 text-red-200" : value === "none" ? "border-white/5 text-zinc-400" : "border-sky-300/30 text-sky-200"}`}><dt className="text-xs">{elements[key] || key}</dt><dd className="font-semibold">{affinityLabels[value] || value}</dd></div> })}
        </dl>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase text-amber-100">Equipamentos</h4>
        {creature.equipment?.length ? <ul className="list-inside list-disc space-y-1 break-words text-zinc-300">{creature.equipment.map((id, index) => <li key={`${id}-${index}`}>{getEquipment(id)?.name || id}</li>)}</ul> : <p className="text-xs text-zinc-400">Nenhum equipamento cadastrado.</p>}
      </div>
      {!!creature.spells?.length && <div>
        <h4 className="mb-2 text-xs font-bold uppercase text-amber-100">Anotações de magias</h4>
        <ul className="list-inside list-disc space-y-2 whitespace-pre-wrap break-words text-zinc-300">{creature.spells.map((spell, index) => <li key={index}>{spell}</li>)}</ul>
      </div>}
    </section>
  )
}

/** Espelha testes tradicionais e especiais mostrados na ficha de personagem. */
function CreatureChecksPanel({ creature, disabled, onRoll, customChecks, onCustomRoll }: {
  creature: CombatCreature
  disabled: boolean
  onRoll: (checkId: string) => void
  customChecks: CustomCheck[]
  onCustomRoll?: (check: CustomCheck) => void
}) {
  const [search, setSearch] = useState("")
  const query = search.trim().toLocaleLowerCase("pt-BR")
  const checks = PRESET_CHECKS.filter(check =>
    check.name.toLocaleLowerCase("pt-BR").includes(query) ||
    check.desc.toLocaleLowerCase("pt-BR").includes(query),
  )
  const specials = customChecks.filter(check =>
    check.name.toLocaleLowerCase("pt-BR").includes(query) ||
    (check.description || "").toLocaleLowerCase("pt-BR").includes(query),
  )

  return (
    <details className="rounded-xl border border-amber-400/25 bg-amber-300/5 p-3">
      <summary className="cursor-pointer select-none text-xs font-bold uppercase tracking-wider text-amber-200">
        Testes e perícias da criatura ({PRESET_CHECKS.length + customChecks.length})
      </summary>
      <label className="mt-3 block text-xs text-zinc-300">
        Procurar teste
        <input type="search" value={search} onChange={event => setSearch(event.target.value)}
          placeholder="Ex.: Reflexos, percepção..."
          className="mt-1 w-full rounded-md border border-white/20 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400" />
      </label>
      <div className="mt-3 grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {specials.length > 0 && <h5 className="col-span-full border-b border-amber-400/25 pb-2 text-[10px] font-bold uppercase tracking-widest text-amber-300">
          Testes especiais do Mestre · {specials.length} disponível(is)
        </h5>}
        {specials.map(check => (
          <button type="button" key={`custom:${check.id}`}
            disabled={disabled || !onCustomRoll}
            onClick={() => onCustomRoll?.(check)}
            className="min-h-24 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-left transition hover:border-amber-300 hover:bg-amber-400/20 disabled:opacity-40"
            title={check.description || check.name}
            aria-label={`Rolar teste especial ${check.name} de ${creature.name}`}
          >
            <span className="flex items-center justify-between gap-2 text-xs font-bold text-amber-100">
              <span>{check.name}</span>
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] uppercase text-amber-300">Especial</span>
            </span>
            <span className="mt-2 flex flex-wrap gap-1">
              {check.dice.map((die, index) => (
                <span key={index} className="rounded border border-amber-400/20 bg-black/40 px-2 py-1 text-[10px] font-semibold text-amber-200">
                  {die.kind === "attribute"
                    ? `${die.attribute.toUpperCase()} (${creature.attributes[die.attribute] || "d6"})`
                    : `d${die.sides}`}
                </span>
              ))}
            </span>
            {check.description && <span className="mt-2 block whitespace-normal text-[11px] leading-relaxed text-zinc-400">
              {check.description}
            </span>}
          </button>
        ))}
        {specials.length > 0 && checks.length > 0 && <h5 className="col-span-full mt-1 border-b border-white/10 pb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          Testes tradicionais
        </h5>}
        {checks.map(check => (
          <button type="button" key={check.id} disabled={disabled}
            onClick={() => onRoll(check.id)}
            className="rounded-lg border border-white/15 bg-zinc-900/80 p-2 text-left transition hover:border-amber-400 hover:bg-amber-400/10 disabled:opacity-40"
            title={check.desc}
            aria-label={`Rolar ${check.name} de ${creature.name}`}
          >
            <span className="block text-xs font-semibold text-amber-100">🎲 {check.name}</span>
            <span className="mt-1 block text-[10px] uppercase text-zinc-400">
              {check.attrs.map(attr => creature.attributes[attr as keyof typeof creature.attributes] || "d6").join(" + ")}
            </span>
          </button>
        ))}
        {!checks.length && !specials.length && <p className="col-span-full py-3 text-center text-xs text-zinc-400">Nenhum teste encontrado.</p>}
      </div>
    </details>
  )
}
