"use client"
import { useState, type ReactNode } from "react"
import {
  canAttack,
  type SpotlightState,
  type SpotlightAction,
} from "@/lib/combat-model"
const button =
  "rounded-lg border border-white/20 px-4 py-3 text-sm font-semibold transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
export function SpotlightAvatar({
  active,
  name,
  avatar,
  children,
}: {
  active: boolean
  name: string
  avatar?: string
  children?: ReactNode
}) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null)
  const showImage = !!avatar && failedAvatar !== avatar
  return (
    <div
      className="flex min-w-0 flex-col items-center gap-3 text-center"
      style={{ width: 112, maxWidth: "100%", flexShrink: 0 }}
    >
      <div
        aria-label={`${name}${active ? ", com o Holofote" : ""}`}
        className={`relative rounded-full border-2 ${active ? "border-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.6)]" : "border-zinc-700"}`}
        style={{ width: 64, height: 64, minWidth: 64, minHeight: 64, flexShrink: 0, boxSizing: "border-box" }}
      >
        {active && (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-2 rounded-full border border-amber-300 motion-safe:animate-pulse"
          />
        )}
        <div
          className="bg-zinc-900"
          style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", overflow: "hidden", borderRadius: "50%" }}
        >
          {children ?? (showImage ? (
            <img
              src={avatar}
              alt=""
              width={64}
              height={64}
              draggable={false}
              onError={() => setFailedAvatar(avatar || null)}
              style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%", objectFit: "cover", objectPosition: "center 20%", borderRadius: "50%" }}
            />
          ) : (
            <span aria-hidden className="text-xl font-bold">{name.trim().slice(0, 2).toUpperCase() || "?"}</span>
          ))}
        </div>
      </div>
      <span className="w-full text-sm leading-snug" style={{ overflowWrap: "anywhere" }}>
        {name}
      </span>
      {active && <span className="text-xs leading-snug text-amber-200">Sua vez de agir</span>}
    </div>
  )
}

export function SpotlightPanel({
  state,
  viewerId,
  isGm,
  dispatch,
  attackSlot,
}: {
  state: SpotlightState
  viewerId: string
  isGm: boolean
  dispatch: (action: SpotlightAction) => void
  attackSlot?: ReactNode
}) {
  const [passive, setPassive] = useState<0 | 1 | 2>(1)
  const r = state.request
  const requester = state.players.find((p) => p.id === r?.playerId)
  const eligible = state.players.some((p) => p.id === viewerId)
  const approved = !!r?.approved.includes(viewerId)
  return (
    <section className="rounded-2xl border border-amber-300/25 bg-zinc-950 p-5 text-zinc-100 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-amber-100">Holofote</h2>
          <p className="text-sm text-zinc-400" role="status">
            {state.side === "gm"
              ? "O Mestre está agindo"
              : state.activePlayerId
                ? "Um aliado está agindo"
                : "O grupo escolhe quem age"}
          </p>
        </div>
        {isGm && (
          <span className="rounded-full border border-red-400/30 bg-red-950 px-4 py-2 text-red-200">
            {state.tokens} Tokens de Ação
          </span>
        )}
      </header>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-6 py-2">
        {state.players.map((p) => (
          <SpotlightAvatar
            key={p.id}
            name={p.name}
            avatar={p.avatar}
            active={state.activePlayerId === p.id && state.side === "group"}
          />
        ))}
      </div>
      {isGm && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={button}
              onClick={() => dispatch({ type: "gm-pass" })}
            >
              Passar Holofote para o Grupo
            </button>
            <button
              type="button"
              className={`${button} border-red-400/50 bg-red-700`}
              disabled={state.tokens < 1 || state.side === "gm"}
              onClick={() => dispatch({ type: "gm-steal" })}
            >
              Roubar Holofote (Gasta 1 Token)
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm">
              Tokens a adquirir{" "}
              <select
                className="ml-2 rounded bg-zinc-900 p-2"
                value={passive}
                onChange={(e) =>
                  setPassive(Number(e.target.value) as 0 | 1 | 2)
                }
              >
                {[1, 2].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={button}
              onClick={() =>
                dispatch({ type: "gm-round", passiveTokens: passive })
              }
            >
              Adquirir Tokens de Ação
            </button>
          </div>
          {r && (
            <p role="status" className="text-sm text-zinc-300">
              {requester?.name}: {r.approved.length}/{r.required.length} aliados
              aprovaram.
            </p>
          )}
        </div>
      )}
      <>
        {eligible && state.side === "group" && !state.activePlayerId && !r && (
          <button
            type="button"
            className={`${button} bg-amber-300 text-zinc-950`}
            onClick={() =>
              dispatch({
                type: "request",
                actorId: viewerId,
                requestId: crypto.randomUUID(),
              })
            }
          >
            {isGm ? "Agir com meu personagem" : "Pedir Holofote"}
          </button>
        )}
        {r?.playerId === viewerId && (
          <div
            role="status"
            className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-4"
          >
            <p>Aguardando aprovação do Mestre e dos aliados...</p>
            <p className="mt-1 text-sm text-zinc-400">
              {r.approved.length} de {r.required.length} aprovações.
            </p>
            <button
              type="button"
              className={`${button} mt-3`}
              onClick={() =>
                dispatch({
                  type: "cancel",
                  actorId: viewerId,
                  requestId: r.id,
                })
              }
            >
              Cancelar pedido
            </button>
          </div>
        )}
        {r && r.required.includes(viewerId) && (
          <div
            role="alert"
            className="rounded-xl border border-sky-300/40 bg-sky-950/50 p-4"
          >
            <p>{requester?.name} quer agir.</p>
            <button
              type="button"
              className={`${button} mt-3`}
              disabled={approved}
              onClick={() =>
                dispatch({
                  type: "approve",
                  actorId: viewerId,
                  requestId: r.id,
                })
              }
            >
              {approved ? "Aprovação enviada" : "Aceitar"}
            </button>
          </div>
        )}
        {canAttack(state, viewerId) && (
          <div className="flex flex-wrap gap-3">
            {attackSlot}
            <button
              type="button"
              className={button}
              onClick={() => dispatch({ type: "finish", actorId: viewerId })}
            >
              Concluir ação e devolver ao grupo
            </button>
          </div>
        )}
      </>
    </section>
  )
}
