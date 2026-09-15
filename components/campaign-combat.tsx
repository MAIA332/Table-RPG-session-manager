"use client"
import { useEffect, useRef, useState } from "react"
import { CreatureAbilitiesManager } from "./creature-abilities-manager"
import { SpotlightPanel } from "./spotlight-panel"
import { CreatureResourceControls } from "./combat-monster-card"
import { QteOverlay } from "./qte-overlay"
import { AttackEditor } from "./creature-combat-editor"
import {
  canAttack,
  defaultAttack,
  validateCombat,
  type Attack,
  type SpotlightAction,
} from "@/lib/combat-model"
import type { useCombat } from "@/lib/use-combat"
import type { Character } from "@/lib/types"
export type CombatActionRequest = {
  id: string
  instanceId: string
  attackIndex?: number
  abilityId?: string
}
type Props = {
  controller: ReturnType<typeof useCombat>
  viewerId: string
  isGm: boolean
  characters: Character[]
  members: Array<{ userId: string; role: string; name: string }>
  onAbilitiesSaved?: () => void | Promise<void>
  actionRequest: CombatActionRequest | null
}
const button =
  "rounded-lg border border-white/20 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:border-amber-300 focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
const select =
  "rounded-lg border border-white/20 bg-zinc-900 p-2.5 text-sm text-white"
export function CampaignCombat({
  controller,
  viewerId,
  isGm,
  characters,
  members,
  actionRequest,
  onAbilitiesSaved,
}: Props) {
  const { combat, status, error, pending, send, serverOffset } = controller
  const [open, setOpen] = useState(false),
    [settings, setSettings] = useState(false)
  const [rosterDraft, setRosterDraft] = useState<string[] | null>(null)
  const [selectedCreature, setSelectedCreature] = useState("")
  const [editingAbilities, setEditingAbilities] = useState<string | null>(null)
  const [targetAttack, setTargetAttack] = useState<{
    instanceId: string
    attackIndex?: number
    abilityId?: string
  } | null>(null)
  const [loadoutCharacter, setLoadoutCharacter] = useState("")
  const [draft, setDraft] = useState<Attack>(defaultAttack)
  const [playerAttack, setPlayerAttack] = useState(0),
    [target, setTarget] = useState(""),
    [bondId, setBondId] = useState("")
  const [localError, setLocalError] = useState(""),
    [flash, setFlash] = useState<number | null>(null)
  const seen = useRef(new Set<string>()),
    flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!actionRequest) return
    setOpen(true)
    setSelectedCreature(actionRequest.instanceId)
    setTargetAttack(
      actionRequest.attackIndex !== undefined || actionRequest.abilityId
        ? {
            instanceId: actionRequest.instanceId,
            attackIndex: actionRequest.attackIndex,
            abilityId: actionRequest.abilityId,
          }
        : null,
    )
  }, [actionRequest])
  useEffect(() => {
    const owned = new Set(
      characters.filter((c) => c.ownerId === viewerId).map((c) => c.id),
    )
    for (const entry of combat?.log || []) {
      if (seen.current.has(entry.id)) continue
      seen.current.add(entry.id)
      if (
        entry.characterId &&
        owned.has(entry.characterId) &&
        entry.damage &&
        entry.damage > 0 &&
        Date.now() + serverOffset - entry.at < 5000
      ) {
        setFlash(entry.damage)
        if (flashTimer.current) clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => setFlash(null), 1300)
      }
    }
    if (seen.current.size > 200)
      seen.current = new Set((combat?.log || []).map((e) => e.id))
  }, [combat?.log, characters, viewerId, serverOffset])
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    },
    [],
  )
  useEffect(() => {
    if (combat?.spotlight.side !== "gm") setTargetAttack(null)
  }, [combat?.spotlight.side])
  const run = async (command: { type: string; [key: string]: unknown }) => {
    setLocalError("")
    try {
      return await send(command)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Ação não confirmada")
      return null
    }
  }
  const [controlledId, setControlledId] = useState("")
  const owned =
    combat?.characters.filter(
      (c) =>
        c.ownerId === viewerId && combat.participantCharacterIds.includes(c.id),
    ) || []
  const myCharacter =
    owned.find((c) => c.id === combat?.actorCharacterId) ||
    owned.find((c) => c.id === controlledId) ||
    owned[0]
  const reactingCharacter =
    owned.find(
      (c) => combat?.qte?.targets.includes(c.id) && !combat.qte.outcomes[c.id],
    ) || myCharacter
  useEffect(() => {
    if (!isGm && !combat?.enabled) setOpen(false)
  }, [isGm, combat?.enabled])
  const request = combat?.spotlight.request
  const mustApprove =
    !!request?.required.includes(viewerId) &&
    !request.approved.includes(viewerId)
  const handleSpotlight = (action: SpotlightAction) => {
    if (action.type === "request") {
      if (!myCharacter) {
        setLocalError(
          "Peça ao Mestre para incluir seu personagem nos participantes.",
        )
        return
      }
      void run({ type: "request", characterId: myCharacter.id })
      return
    }
    if (action.type === "approve" || action.type === "cancel") {
      void run({ type: action.type, requestId: action.requestId })
      return
    }
    if (action.type === "gm-round") {
      void run({ type: action.type, passiveTokens: action.passiveTokens })
      return
    }
    if (
      action.type === "finish" ||
      action.type === "gm-pass" ||
      action.type === "gm-steal"
    )
      void run({ type: action.type })
  }
  const playerChars = characters.filter((c) =>
    members.some((m) => m.userId === c.ownerId),
  )
  const defaultRoster = playerChars.filter((c) => !!c.id).map((c) => c.id)
  const chosen =
    rosterDraft ??
    (combat?.participantCharacterIds.length
      ? combat.participantCharacterIds
      : defaultRoster)
  const creature =
    combat?.creatures.find((c) => c.instanceId === selectedCreature) ||
    combat?.creatures[0]
  const pcAttacks = myCharacter
    ? combat?.playerAttacks[myCharacter.id] || []
    : []
  const fullCharacter = characters.find((c) => c.id === myCharacter?.id) as any
  const bonds: any[] = fullCharacter
    ? [
        ...(fullCharacter.customModifiers || [])
          .filter((m: any) => m.type === "bond")
          .map((m: any) => ({ id: m.id, name: m.bondTarget, value: m.value })),
        ...(fullCharacter.bonds || [])
          .filter(
            (b: any) =>
              !(fullCharacter.customModifiers || []).some(
                (m: any) => m.id === b.id,
              ),
          )
          .map((b: any) => ({ id: b.id, name: b.target, value: b.value })),
      ]
    : []
  const canMonsterAct =
    !!combat?.enabled &&
    combat.spotlight.side === "gm" &&
    (!combat.qte ||
      combat.qte.targets.every((id) => !!combat.qte!.outcomes[id]))
  return (
    <>
      {editingAbilities &&
        combat?.creatures.find((c) => c.instanceId === editingAbilities) && (
          <CreatureAbilitiesManager
            key={editingAbilities}
            creature={combat!.creatures.find(
              (c) => c.instanceId === editingAbilities,
            )!}
            controller={controller}
            onClose={() => setEditingAbilities(null)}
            onSaved={onAbilitiesSaved}
          />
        )}
      {(isGm || combat?.enabled) && (
        <button
          type="button"
          className="fixed bottom-4 left-4 z-[350] rounded-full border border-amber-300/60 bg-zinc-950 px-5 py-3 font-bold text-amber-200 shadow-xl"
          onClick={() => setOpen(true)}
        >
          ⚔ Combate {combat?.enabled ? "· Em andamento" : ""}
          {status !== "live" && " · Conectando"}
        </button>
      )}
      {!open && (isGm || combat?.enabled) && (error || localError) && (
        <aside
          role="alert"
          className="fixed bottom-20 left-4 z-[650] max-w-sm rounded-xl border border-red-400 bg-zinc-950 p-4 text-red-100"
        >
          {localError || error}
          <button className={`${button} mt-2`} onClick={() => setOpen(true)}>
            Abrir combate
          </button>
        </aside>
      )}
      {!open && mustApprove && request && (
        <aside
          role="alert"
          className="fixed right-4 top-4 z-[600] max-w-sm rounded-xl border border-amber-300 bg-zinc-950 p-5 text-white shadow-2xl"
        >
          <p>
            {
              combat?.spotlight.players.find((p) => p.id === request.playerId)
                ?.name
            }{" "}
            quer agir.
          </p>
          <button
            className={`${button} mt-3`}
            disabled={pending}
            onClick={() => void run({ type: "approve", requestId: request.id })}
          >
            Aceitar
          </button>
        </aside>
      )}
      {open && (isGm || combat?.enabled) && (
        <div
          className="fixed inset-0 overflow-y-auto bg-black/90 p-3 sm:p-6"
          style={{ zIndex: 9999 }}
          role="dialog"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
          }}
        >
          <div className="mx-auto max-w-5xl rounded-2xl border border-amber-300/25 bg-zinc-950 p-4 pb-24 text-white sm:p-6">
            <header className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Combate</h2>
                <span className="text-xs text-zinc-400">
                  {status === "live"
                    ? "Sincronizado"
                    : status === "connecting"
                      ? "Conectando…"
                      : "Reconectando…"}
                  {pending && " · Confirmando ação…"}
                </span>
              </div>
              <button
                autoFocus
                className={button}
                onClick={() => setOpen(false)}
              >
                Fechar
              </button>
            </header>
            {(error || localError) && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-red-400/40 bg-red-950 p-3 text-red-100"
              >
                {localError || error}
              </p>
            )}
            {!combat ? (
              <p>Carregando combate…</p>
            ) : (
              <>
                {isGm && (
                  <div className="mb-4 flex flex-wrap gap-3">
                    <button
                      className={button}
                      onClick={() => setSettings(!settings)}
                    >
                      {settings
                        ? "Fechar configuração"
                        : "Participantes e ataques dos jogadores"}
                    </button>
                    {combat.enabled && (
                      <button
                        className={button}
                        disabled={pending}
                        onClick={() => {
                          if (
                            confirm(
                              "Encerrar o combate? Os tokens serão zerados; criaturas e ataques cadastrados serão preservados.",
                            )
                          )
                            void run({ type: "end" })
                        }}
                      >
                        Encerrar combate
                      </button>
                    )}
                  </div>
                )}
                {isGm && (!combat.enabled || settings) && (
                  <section className="mb-5 space-y-4 rounded-xl border border-white/15 p-4">
                    <h3 className="font-bold">
                      Participantes · inclua também os personagens do Mestre
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {playerChars.map((c) => (
                        <label
                          key={c.id}
                          className="flex gap-2 rounded-lg border border-white/10 p-3"
                        >
                          <input
                            type="checkbox"
                            checked={chosen.includes(c.id)}
                            onChange={(e) =>
                              setRosterDraft(
                                e.target.checked
                                  ? [...chosen, c.id]
                                  : chosen.filter((id) => id !== c.id),
                              )
                            }
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                    <button
                      className={button}
                      disabled={pending || !chosen.length}
                      onClick={async () => {
                        if (
                          await run({
                            type: combat.enabled ? "roster" : "start",
                            characterIds: chosen,
                          })
                        ) {
                          setRosterDraft(null)
                          setSettings(false)
                        }
                      }}
                    >
                      {combat.enabled
                        ? "Atualizar participantes"
                        : "Iniciar combate"}
                    </button>
                    <details className="border-t border-white/15 pt-4">
                      <summary className="cursor-pointer font-semibold">
                        Cadastrar ataques de jogadores
                      </summary>
                      <p className="my-3 text-sm text-zinc-400">
                        Defina uma vez o acerto e o dano de cada ataque. As
                        rolagens usarão os atributos e modificadores reais da
                        ficha.
                      </p>
                      <label className="block">
                        Personagem{" "}
                        <select
                          className={select}
                          value={loadoutCharacter}
                          onChange={(e) => setLoadoutCharacter(e.target.value)}
                        >
                          <option value="">Selecione</option>
                          {playerChars.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="my-4">
                        <AttackEditor value={draft} onChange={setDraft} />
                      </div>
                      <button
                        className={button}
                        disabled={pending || !loadoutCharacter}
                        onClick={async () => {
                          const issue = validateCombat([draft], [])
                          if (issue) {
                            setLocalError(issue)
                            return
                          }
                          if (
                            await run({
                              type: "set-attacks",
                              characterId: loadoutCharacter,
                              attacks: [
                                ...(combat.playerAttacks[loadoutCharacter] ||
                                  []),
                                draft,
                              ],
                            })
                          )
                            setDraft(defaultAttack())
                        }}
                      >
                        Adicionar ataque
                      </button>
                      {(combat.playerAttacks[loadoutCharacter] || []).map(
                        (a, i) => (
                          <div
                            key={i}
                            className="mt-3 flex items-center justify-between gap-3 rounded border border-white/10 p-3"
                          >
                            <span>
                              {a.name} ·{" "}
                              {a.attributes.join(" + ").toUpperCase()} ·{" "}
                              {a.damage} {a.type}
                            </span>
                            <button
                              className={button}
                              disabled={pending}
                              onClick={() =>
                                void run({
                                  type: "set-attacks",
                                  characterId: loadoutCharacter,
                                  attacks: combat.playerAttacks[
                                    loadoutCharacter
                                  ].filter((_, index) => i !== index),
                                })
                              }
                            >
                              Remover
                            </button>
                          </div>
                        ),
                      )}
                    </details>
                  </section>
                )}
                {isGm && combat.enabled && (
                  <p
                    role="status"
                    className="my-4 rounded-xl bg-amber-300/10 p-4 text-amber-100"
                  >
                    {combat.qte &&
                    !combat.qte.targets.every((id) => combat.qte!.outcomes[id])
                      ? "QTE em andamento: acompanhe as reações abaixo."
                      : combat.spotlight.request
                        ? "Próximo passo: aprove o pedido de Holofote abaixo."
                        : combat.spotlight.side === "gm"
                          ? "Sua ação: escolha uma criatura, clique no ataque e depois no personagem alvo."
                          : "O grupo está agindo. Aprove os pedidos ou use Roubar Holofote para agir com os inimigos."}
                  </p>
                )}
                {combat.enabled ? (
                  <fieldset disabled={pending} className="min-w-0">
                    {owned.length > 1 && (
                      <label className="mb-4 block">
                        Agir como
                        <select
                          className={select}
                          value={myCharacter?.id || ""}
                          disabled={!!combat.actorCharacterId}
                          onChange={(e) => setControlledId(e.target.value)}
                        >
                          {owned.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <SpotlightPanel
                      state={combat.spotlight}
                      viewerId={viewerId}
                      isGm={isGm}
                      dispatch={handleSpotlight}
                      attackSlot={
                        myCharacter && canAttack(combat.spotlight, viewerId) ? (
                          <div className="w-full space-y-3 rounded-xl border border-amber-300/30 p-4">
                            <h3 className="font-bold">Seu ataque</h3>
                            {!pcAttacks.length ? (
                              <p>
                                O Mestre precisa cadastrar seus ataques em
                                “Participantes e ataques dos jogadores”.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-3">
                                <label>
                                  Ataque{" "}
                                  <select
                                    className={select}
                                    value={playerAttack}
                                    onChange={(e) =>
                                      setPlayerAttack(Number(e.target.value))
                                    }
                                  >
                                    {pcAttacks.map((a, i) => (
                                      <option key={i} value={i}>
                                        {a.name} · {a.damage}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Alvo{" "}
                                  <select
                                    className={select}
                                    value={target}
                                    onChange={(e) => setTarget(e.target.value)}
                                  >
                                    <option value="">
                                      Selecione a criatura
                                    </option>
                                    {combat.creatures
                                      .filter((c) => c.currentHp > 0)
                                      .map((c) => (
                                        <option
                                          key={c.instanceId}
                                          value={c.instanceId}
                                        >
                                          {c.name}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                                <button
                                  className={`${button} border-amber-300`}
                                  disabled={
                                    !target ||
                                    !pcAttacks[playerAttack] ||
                                    myCharacter.resources.hp <= 0 ||
                                    (!!combat.qte &&
                                      !combat.qte.targets.every(
                                        (id) => !!combat.qte!.outcomes[id],
                                      ))
                                  }
                                  onClick={async () => {
                                    if (
                                      await run({
                                        type: "player-attack",
                                        characterId: myCharacter.id,
                                        instanceId: target,
                                        attackIndex: playerAttack,
                                        bondId: bondId || undefined,
                                      })
                                    )
                                      setBondId("")
                                  }}
                                >
                                  Rolar ataque
                                </button>
                              </div>
                            )}
                          </div>
                        ) : undefined
                      }
                    />
                  </fieldset>
                ) : (
                  !isGm && <p>Aguardando o Mestre iniciar o combate.</p>
                )}
                {bonds.length > 0 && (
                  <label className="mt-3 block text-sm">
                    Laço para a próxima ação ou reação{" "}
                    <select
                      className={select}
                      value={bondId}
                      onChange={(e) => setBondId(e.target.value)}
                    >
                      <option value="">Sem laço</option>
                      {bonds.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} (+{b.value})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <section className="mt-5 space-y-4 rounded-xl border border-white/15 p-4">
                  <h3 className="font-bold">Criaturas em cena</h3>
                  {!combat.creatures.length ? (
                    <p className="text-zinc-400">
                      Adicione criaturas pelo Bestiário do Mestre.
                    </p>
                  ) : (
                    <>
                      {isGm ? (
                        <>
                          <label>
                            Criatura{" "}
                            <select
                              className={select}
                              value={creature?.instanceId || ""}
                              onChange={(e) => {
                                setSelectedCreature(e.target.value)
                                setTargetAttack(null)
                              }}
                            >
                              {combat.creatures.map((c) => (
                                <option key={c.instanceId} value={c.instanceId}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : (
                        <div className="flex gap-2">
                          {combat.creatures.map((c) => (
                            <button
                              key={c.instanceId}
                              aria-label={`Selecionar ${c.name}`}
                              onClick={() => setSelectedCreature(c.instanceId)}
                            >
                              <img
                                src={c.imageUrl}
                                alt={c.name}
                                className="size-16 rounded object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                      {creature && (
                        <>
                          <div
                            className={
                              isGm
                                ? "flex items-center gap-4"
                                : "flex flex-col items-start gap-4"
                            }
                          >
                            <img
                              src={creature.imageUrl}
                              alt=""
                              className={
                                isGm
                                  ? "size-16 rounded-lg object-cover"
                                  : "aspect-[3/4] w-full max-w-md rounded-xl object-cover"
                              }
                            />
                            {isGm && <strong>{creature.name}</strong>}
                            {isGm ? (
                              <span>
                                {creature.currentHp}/{creature.maxHp} HP ·{" "}
                                {creature.currentMp}/{creature.maxMp} MP
                              </span>
                            ) : null}
                          </div>
                          {isGm && (
                            <CreatureResourceControls
                              creature={creature}
                              pending={pending}
                              onChange={(resource, change) => {
                                const max =
                                  resource === "currentHp"
                                    ? creature.maxHp
                                    : creature.maxMp
                                void run({
                                  type: "update-creature",
                                  instanceId: creature.instanceId,
                                  updates: {
                                    [resource]:
                                      change === "full"
                                        ? max
                                        : Math.max(
                                            0,
                                            Math.min(
                                              max,
                                              creature[resource] + change,
                                            ),
                                          ),
                                  },
                                })
                              }}
                            />
                          )}
                          {isGm && (
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-3">
                                <button
                                  className={button}
                                  disabled={pending}
                                  onClick={() =>
                                    setEditingAbilities(creature.instanceId)
                                  }
                                >
                                  Configurar habilidades / QTE
                                </button>
                                {(creature.basicAttacksV2 || []).map((a, i) => (
                                  <button
                                    className={button}
                                    key={i}
                                    disabled={
                                      pending ||
                                      !canMonsterAct ||
                                      creature.currentHp <= 0
                                    }
                                    onClick={() =>
                                      setTargetAttack({
                                        instanceId: creature.instanceId,
                                        attackIndex: i,
                                      })
                                    }
                                  >
                                    {a.name} · {a.damage}
                                  </button>
                                ))}
                                {(creature.abilities || []).map((a) =>
                                  a.kind === "passive" ? (
                                    <p
                                      key={a.id}
                                      className="w-full rounded-lg bg-zinc-900 p-3 text-sm"
                                    >
                                      {a.name}: {a.trigger} — {a.effect}
                                    </p>
                                  ) : (
                                    <button
                                      key={a.id}
                                      className={`${button} ${a.kind === "qte" ? "border-red-400" : "border-violet-400"}`}
                                      disabled={
                                        pending ||
                                        !canMonsterAct ||
                                        creature.currentHp <= 0
                                      }
                                      onClick={() => {
                                        if (a.kind === "qte")
                                          void run({
                                            type: "start-qte",
                                            instanceId: creature.instanceId,
                                            abilityId: a.id,
                                          })
                                        else
                                          setTargetAttack({
                                            instanceId: creature.instanceId,
                                            abilityId: a.id,
                                          })
                                      }}
                                    >
                                      {a.kind === "qte" ? "QTE · " : ""}
                                      {a.name} · {a.cost.amount}{" "}
                                      {a.cost.resource === "mp"
                                        ? "MP"
                                        : "Tokens"}
                                    </button>
                                  ),
                                )}
                              </div>
                              {targetAttack && (
                                <div className="rounded-xl border border-red-400/40 p-4">
                                  <p className="mb-3 font-bold">
                                    Clique no avatar do alvo
                                  </p>
                                  <div className="flex flex-wrap gap-3">
                                    {combat.characters
                                      .filter((c) =>
                                        combat.participantCharacterIds.includes(
                                          c.id,
                                        ),
                                      )
                                      .map((c) => (
                                        <button
                                          className={button}
                                          key={c.id}
                                          disabled={
                                            pending ||
                                            c.resources.hp <= 0 ||
                                            !canMonsterAct
                                          }
                                          onClick={async () => {
                                            if (
                                              await run({
                                                type: "monster-attack",
                                                ...targetAttack,
                                                characterId: c.id,
                                              })
                                            )
                                              setTargetAttack(null)
                                          }}
                                        >
                                          <span className="flex items-center gap-2">
                                            {c.avatarUrl ? (
                                              <img
                                                src={c.avatarUrl}
                                                alt=""
                                                className="size-10 rounded-full object-cover"
                                              />
                                            ) : (
                                              <span className="grid size-10 place-items-center rounded-full bg-zinc-800">
                                                {c.name.slice(0, 2)}
                                              </span>
                                            )}
                                            {c.name}
                                          </span>
                                        </button>
                                      ))}
                                  </div>
                                  <button
                                    className={`${button} mt-3`}
                                    onClick={() => setTargetAttack(null)}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {isGm && combat.enabled && (
                    <details>
                      <summary className="cursor-pointer text-sm">
                        Reações e reforços
                      </summary>
                      <p className="my-2 text-sm text-zinc-400">
                        Desconte o custo e narre a reação; adicione reforços
                        pelo bestiário.
                      </p>
                      <button
                        className={button}
                        disabled={pending || combat.spotlight.tokens < 1}
                        onClick={() =>
                          void run({ type: "gm-spend", amount: 1 })
                        }
                      >
                        Gastar 1 Token
                      </button>
                    </details>
                  )}
                </section>
                {combat.qte && isGm && (
                  <section className="mt-5 rounded-xl border border-red-400/40 p-4">
                    <h3>{combat.qte.ability.name}</h3>
                    {combat.qte.targets.map((id) => (
                      <p key={id} className="mt-2 text-sm">
                        {combat.characters.find((c) => c.id === id)?.name}:{" "}
                        {combat.qte!.outcomes[id]
                          ? `${combat.qte!.outcomes[id].success ? "Sucesso" : "Falha"} · ${combat.qte!.outcomes[id].damage} dano`
                          : "Aguardando reação"}
                      </p>
                    ))}
                    {combat.qte.targets.every(
                      (id) => !!combat.qte!.outcomes[id],
                    ) && (
                      <button
                        className={`${button} mt-3`}
                        disabled={pending}
                        onClick={() => void run({ type: "close-qte" })}
                      >
                        Encerrar aviso do QTE
                      </button>
                    )}
                  </section>
                )}
                <section className="mt-5">
                  <h3 className="font-bold">Registro do combate</h3>
                  <ol className="mt-3 max-h-60 space-y-2 overflow-auto text-sm text-zinc-300">
                    {combat.log.map((entry) => (
                      <li key={entry.id}>{entry.text}</li>
                    ))}
                  </ol>
                </section>
              </>
            )}
          </div>
        </div>
      )}
      {reactingCharacter && (
        <QteOverlay
          key={reactingCharacter.id}
          characterName={reactingCharacter.name}
          qte={combat?.qte || null}
          playerId={reactingCharacter.id}
          serverOffset={serverOffset}
          onReact={async (qteId: any, characterId: any) => {
            await send({
              type: "react",
              qteId,
              characterId,
              bondId:
                reactingCharacter.id === myCharacter?.id
                  ? bondId || undefined
                  : undefined,
            })
            setBondId("")
          }}
        />
      )}
      {flash !== null && (
        <div
          aria-live="assertive"
          className="pointer-events-none fixed inset-0 z-[750] border-[12px] border-red-600/50 bg-red-600/15 shadow-[inset_0_0_120px_rgba(220,38,38,0.7)]"
        >
          <span className="absolute left-1/2 top-1/4 -translate-x-1/2 text-6xl font-black text-red-200 motion-safe:animate-pulse">
            −{flash} HP
          </span>
        </div>
      )}
    </>
  )
}
