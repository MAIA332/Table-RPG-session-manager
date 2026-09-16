"use client"
import { useEffect, useState, type ReactNode } from "react"
import {
  ATTRIBUTES,
  newAbility,
  type Ability,
  type Attack,
  type Attribute,
  type Cost,
} from "@/lib/combat-model"
import { QTE_CHECKS } from "@/lib/combat-checks"
const input =
  "w-full min-w-0 rounded-lg border border-white/15 bg-zinc-900 p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-xs text-zinc-300">
      {title}
      {children}
    </label>
  )
}
export function AttackEditor({
  value,
  onChange,
}: {
  value: Attack
  onChange: (attack: Attack) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Field title="Nome do ataque">
        <input
          className={input}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Field>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-xs text-zinc-300">
          Fórmula de acerto
        </legend>
        <div className="flex gap-1 items-center">
          {[0, 1].map((i) => (
            <select
              key={i}
              aria-label={`Atributo ${i + 1} do acerto`}
              className={input}
              value={value.attributes[i]}
              onChange={(e) => {
                const attributes = [...value.attributes]
                attributes[i] = e.target.value as Attribute
                onChange({ ...value, attributes })
              }}
            >
              {ATTRIBUTES.map((a) => (
                <option key={a} value={a}>
                  {a.toUpperCase()}
                </option>
              ))}
            </select>
          ))}
        </div>
      </fieldset>
      <Field title="Alvo do ataque">
        <select
          className={input}
          value={value.targetDefense}
          onChange={(e) =>
            onChange({
              ...value,
              targetDefense: e.target.value as Attack["targetDefense"],
            })
          }
        >
          <option value="physical">Defesa Física</option>
          <option value="magical">Defesa Mágica</option>
        </select>
      </Field>
      <Field title="Dano fixo ou dados">
        <input
          className={input}
          value={value.damage}
          placeholder="10 ou 2d6+2"
          onChange={(e) => onChange({ ...value, damage: e.target.value })}
        />
      </Field>
      <Field title="Tipo de dano">
        <select
          className={input}
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value })}
        >
          {[
            "físico",
            "fogo",
            "gelo",
            "raio",
            "ar",
            "terra",
            "luz",
            "trevas",
            "veneno",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2 xl:col-span-5">
        <Field title="Descrição / efeito do ataque">
          <textarea className={input} rows={2} value={value.description || ""} onChange={e => onChange({ ...value, description: e.target.value })} />
        </Field>
      </div>
    </div>
  )
}
function CostEditor({
  cost,
  onChange,
}: {
  cost: Cost
  onChange: (c: Cost) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field title="Custo">
        <input
          type="number"
          min={0}
          step={1}
          className={input}
          value={cost.amount}
          onChange={(e) =>
            onChange({ ...cost, amount: e.target.valueAsNumber })
          }
        />
      </Field>
      <Field title="Recurso">
        <select
          className={input}
          value={cost.resource}
          onChange={(e) =>
            onChange({ ...cost, resource: e.target.value as Cost["resource"] })
          }
        >
          <option value="mp">MP</option>
          <option value="token">Tokens de Ação</option>
        </select>
      </Field>
    </div>
  )
}
export function AbilityEditor({
  value,
  onChange,
  focusId,
}: {
  value: Ability[]
  onChange: (abilities: Ability[]) => void
  focusId?: string
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => {
    if (focusId) setOpenId(focusId)
  }, [focusId])
  const patch = (a: Ability) =>
    onChange(value.map((item) => (item.id === a.id ? a : item)))
  return (
    <section className="space-y-3">
      <h3 className="font-bold text-amber-200">Habilidades</h3>
      {!value.length && (
        <p className="rounded-lg border border-dashed border-white/20 p-5 text-sm text-zinc-400">
          Adicione ataques, passivas ou eventos de reação rápida.
        </p>
      )}
      {value.map((a, i) => (
        <article
          key={a.id}
          className="rounded-xl border border-white/15 bg-zinc-950 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex-1 text-left font-semibold text-white"
              aria-expanded={openId === a.id}
              aria-controls={`ability-${a.id}`}
              onClick={() => setOpenId(openId === a.id ? null : a.id)}
            >
              {openId === a.id ? "▾" : "▸"} {i + 1}. {a.name || "Sem nome"}{" "}
              <span className="ml-2 text-xs text-zinc-400">
                {a.kind === "attack"
                  ? "Ataque / Magia"
                  : a.kind === "passive"
                    ? "Passiva"
                    : "Área / QTE"}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Remover ${a.name}`}
              className="p-2 text-sm text-red-300"
              onClick={() => {
                if (window.confirm(`Remover ${a.name}?`))
                  onChange(value.filter((item) => item.id !== a.id))
              }}
            >
              Remover
            </button>
          </div>
          {openId === a.id && (
            <div id={`ability-${a.id}`} className="mt-4 space-y-4">
              <Field title="Tipo de habilidade">
                <select
                  className={input}
                  value={a.kind}
                  onChange={(e) => {
                    const kind = e.target.value as Ability["kind"]
                    if (
                      window.confirm(
                        "Trocar o tipo redefine os campos específicos desta habilidade. Continuar?",
                      )
                    )
                      patch({ ...newAbility(kind, a.id), name: a.name })
                  }}
                >
                  <option value="attack">Ataque / Magia</option>
                  <option value="passive">Passiva</option>
                  <option value="qte">Ação de Área / QTE</option>
                </select>
              </Field>
              <Field title="Nome da habilidade">
                <input
                  className={input}
                  value={a.name}
                  onChange={(e) => patch({ ...a, name: e.target.value })}
                />
              </Field>
              {a.kind === "attack" && (
                <>
                  <CostEditor
                    cost={a.cost}
                    onChange={(cost) => patch({ ...a, cost })}
                  />
                  <AttackEditor
                    value={a.attack}
                    onChange={(attack) => patch({ ...a, attack })}
                  />
                  <Field title="Efeito narrativo">
                    <textarea
                      className={input}
                      rows={2}
                      value={a.attack.description || ""}
                      onChange={(e) =>
                        patch({
                          ...a,
                          attack: { ...a.attack, description: e.target.value },
                        })
                      }
                    />
                  </Field>
                </>
              )}
              {a.kind === "passive" && (
                <>
                  <Field title="Gatilho">
                    <input
                      className={input}
                      placeholder="Ex.: ao receber dano de fogo"
                      value={a.trigger}
                      onChange={(e) => patch({ ...a, trigger: e.target.value })}
                    />
                  </Field>
                  <Field title="Descrição do efeito">
                    <textarea
                      className={input}
                      rows={3}
                      value={a.effect}
                      onChange={(e) => patch({ ...a, effect: e.target.value })}
                    />
                  </Field>
                </>
              )}
              {a.kind === "qte" && (
                <>
                  <CostEditor
                    cost={a.cost}
                    onChange={(cost) => patch({ ...a, cost })}
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field title="Tempo de reação">
                      <select
                        className={input}
                        value={a.seconds}
                        onChange={(e) =>
                          patch({
                            ...a,
                            seconds: Number(e.target.value) as typeof a.seconds,
                          })
                        }
                      >
                        {[5, 7, 10, 15, 20].map((t) => (
                          <option key={t} value={t}>
                            {t}s
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field title="Teste exigido">
                      <select
                        className={input}
                        value={a.checkId}
                        onChange={(e) =>
                          patch({ ...a, checkId: e.target.value })
                        }
                      >
                        {QTE_CHECKS.map((check) => (
                          <option key={check.id} value={check.id}>
                            {check.name} (
                            {check.attrs.join(" + ").toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field title="Dificuldade alvo">
                      <input
                        className={input}
                        type="number"
                        min={0}
                        step={1}
                        value={a.difficulty}
                        onChange={(e) =>
                          patch({ ...a, difficulty: e.target.valueAsNumber })
                        }
                      />
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-3 rounded-lg border border-red-400/30 p-3">
                      <Field title="Dano na falha">
                        <input
                          className={input}
                          value={a.failureDamage}
                          onChange={(e) =>
                            patch({ ...a, failureDamage: e.target.value })
                          }
                        />
                      </Field>
                      <Field title="Efeito na falha">
                        <input
                          className={input}
                          value={a.failureEffect}
                          onChange={(e) =>
                            patch({ ...a, failureEffect: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <div className="space-y-3 rounded-lg border border-emerald-400/30 p-3">
                      <Field title="Dano no sucesso">
                        <input
                          className={input}
                          value={a.successDamage}
                          onChange={(e) =>
                            patch({ ...a, successDamage: e.target.value })
                          }
                        />
                      </Field>
                      <Field title="Efeito no sucesso">
                        <input
                          className={input}
                          value={a.successEffect}
                          onChange={(e) =>
                            patch({ ...a, successEffect: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </article>
      ))}
      <button
        type="button"
        className="w-full rounded-xl border border-dashed border-amber-300/50 p-4 font-semibold text-amber-200 hover:bg-amber-200/10 focus-visible:ring-2"
        onClick={() => {
          const a = newAbility("attack", crypto.randomUUID())
          onChange([...value, a])
          setOpenId(a.id)
        }}
      >
        + Adicionar Nova Habilidade
      </button>
    </section>
  )
}
