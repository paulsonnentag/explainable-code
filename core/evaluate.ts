// Formulas, evaluated reactively. Each one is a Solid computation: it reruns
// when a name, slot or value it read changes. A name reads as its formula's
// value; a pending or failed formula makes its readers pending or failed too.
// The host supplies everything that isn't a declared name.

import { createComputed, createRoot, createSignal, getOwner, runWithOwner, type Accessor } from "solid-js"
import type { Formula } from "./parse"

export type State =
  | { status: "pending" }
  | { status: "failed"; error: unknown }
  | { status: "resolved"; value: unknown }

export type Host = {
  /** Names that can't be declared. */
  reserved: ReadonlySet<string>
  /** Whether the host has a value for `name`. Tracked. */
  has(name: string): boolean
  /** The host's value for `name`. Tracked. */
  get(name: string): unknown
  /** A live reading of `value`, for values that change by themselves, such as documents. */
  adapt(value: unknown): Accessor<unknown> | undefined
  /** Called when a declaration resolves, with its value as the formula returned it. */
  declared(name: string, value: unknown): void
  /** Wraps every run of `formula`. */
  run<T>(formula: number, fn: () => T): T
}

export type Evaluation = {
  /** The formula's state. Tracked. */
  state(id: number): State
  dispose(): void
}

type Cell = Accessor<Inner>
type Inner =
  | { status: "pending" }
  | { status: "failed"; error: unknown }
  | { status: "resolved"; value: unknown; live: Accessor<unknown> | undefined }
type Compiled = (scope: object) => unknown

const PENDING: Inner = { status: "pending" }
/** Thrown by a read of a pending name, so the reader is pending too. */
const NOT_YET = Symbol("pending")
const UNSET = Symbol("unset")

export function evaluate(formulas: Formula[], host: Host): Evaluation {
  return createRoot((dispose) => {
    const owner = getOwner()!
    const declarations = new Map<string, Formula[]>()
    for (const formula of formulas) {
      if (formula.name) declarations.set(formula.name, [...(declarations.get(formula.name) ?? []), formula])
    }
    const cells = new Map<number, Cell>()
    const evaluating: string[] = []

    const cellOf = (formula: Formula): Cell => {
      let cell = cells.get(formula.id)
      if (!cell) {
        cell = runWithOwner(owner, () => createCell(formula, scope, host, evaluating, problemWith(formula)))!
        cells.set(formula.id, cell)
      }
      return cell
    }

    const read = (name: string): unknown => {
      const problem = problemWith(declarations.get(name)![0])
      if (problem) throw problem
      const loop = evaluating.indexOf(name)
      if (loop >= 0) throw new Error(`cycle: ${[...evaluating.slice(loop), name].join(" → ")}`)
      const state = cellOf(declarations.get(name)![0])()
      if (state.status === "pending") throw NOT_YET
      if (state.status === "failed") throw state.error
      return state.live ? state.live() : state.value
    }

    const problemWith = (formula: Formula): Error | undefined => {
      if (!formula.name) return undefined
      if (host.reserved.has(formula.name)) return new Error(`"${formula.name}" can't be declared`)
      const count = declarations.get(formula.name)!.length
      if (count > 1) return new Error(`"${formula.name}" is declared ${count} times`)
      return undefined
    }

    const scope = new Proxy(Object.create(null) as object, {
      has: (_, key) => typeof key === "string" && (declarations.has(key) || host.has(key)),
      get: (_, key) => {
        if (typeof key !== "string") return undefined
        return declarations.has(key) ? read(key) : host.get(key)
      },
    })

    for (const formula of formulas) cellOf(formula)

    return {
      state(id) {
        const state = cells.get(id)?.() ?? PENDING
        if (state.status !== "resolved") return state
        return { status: "resolved", value: state.live ? state.live() : state.value }
      },
      dispose,
    }
  })
}

function createCell(formula: Formula, scope: object, host: Host, evaluating: string[], problem: Error | undefined): Cell {
  const [state, setState] = createSignal<Inner>(PENDING)
  if (problem) {
    setState({ status: "failed", error: problem })
    return state
  }

  let compiled: Compiled | undefined
  let last: unknown = UNSET
  let run = 0

  const settle = (value: unknown) => {
    const live = host.adapt(value)
    if (formula.name) host.declared(formula.name, value)
    setState({ status: "resolved", value, live })
  }

  createComputed(() => {
    let value: unknown
    if (formula.name) evaluating.push(formula.name)
    try {
      compiled ??= compile(formula)
      value = host.run(formula.id, () => compiled!(scope))
    } catch (error) {
      last = UNSET
      run++
      setState(error === NOT_YET ? PENDING : { status: "failed", error })
      return
    } finally {
      if (formula.name) evaluating.pop()
    }
    if (value === last) return
    last = value
    const current = ++run
    if (!isThenable(value)) return settle(value)
    setState(PENDING)
    value.then(
      (resolved) => current === run && settle(resolved),
      (error) => current === run && setState({ status: "failed", error }),
    )
  })
  return state
}

/** The formula as a function of the scope. Sloppy mode, so `with` is allowed. */
function compile(formula: Formula): Compiled {
  const async = /\bawait\b/.test(formula.source)
  const body = formula.block
    ? `return (${async ? "async " : ""}function () {\n${formula.source}\n})()`
    : async
      ? `return (async () => (\n${formula.source}\n))()`
      : `return (\n${formula.source}\n)`
  return new Function("scope", `with (scope) {\n${body}\n}`) as Compiled
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  )
}
