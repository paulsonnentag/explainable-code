// The environment, as formulas see it. The explanation gets a scope of its
// own; every document a formula resolves to gets a scope below it. `View`
// mounts a view in a scope of its own, and `Run` runs a behavior in a scope of
// its own, below a document's or below another run's: what the behavior puts
// is seen there and by the views given the run, nowhere else.

import * as Automerge from "@automerge/automerge"
import { createRoot, createSignal, untrack, type Accessor } from "solid-js"
import type { Env, Run as Behavior } from "./environment"
import type { Host as Evaluator } from "./evaluate"
import { isDocBacked, type DocBacked } from "./handle"
import type { Load } from "./loader"
import { recording, type BehaviorRun } from "./record"
import { runValue, type RunValue } from "./run"

/** What the app gives the core: the root scope, holding `repo`, and how urls load. */
export type Runtime = { root: Env; load: Load }

/** A view's default export: called once per mount, inside a Solid root. */
export type View = (env: Env, props: Props) => Node

export type Props = Record<string, unknown>

export type Host = Evaluator & {
  /** The name declared for a document's url, or for an object a declaration resolved to. Tracked. */
  nameOf(urlOrValue: unknown): string | undefined
  destroy(): void
}

type DocumentScope = { scope: Env; snapshot: Accessor<unknown> }
/** Something a formula asked for that lives until the formula stops asking: a view's mount, a run. */
type Kept<T> = { value: T; dispose(): void }
/** What a view or a run is given, as the host places it: its document, the scope it goes below, and a key. */
type Target = { handle: DocBacked | undefined; scope: Env; key: string; run: boolean }

export function createHost(runtime: Runtime, name: string): Host {
  const scope = runtime.root.fork(name)
  const stops: (() => void)[] = []
  const slots = new Map<string, Accessor<unknown>>()
  const documents = new Map<string, DocumentScope>()
  const handles = new WeakMap<object, DocBacked>()
  const runs = new WeakMap<object, { scope: Env; handle: DocBacked; id: number }>()
  const [names, setNames] = createSignal(new Map<unknown, string>(), { equals: false })
  const kept = new Map<number, Map<string, Kept<unknown>>>()
  const loose: Kept<unknown>[] = []
  let active: { formula: number; asked: Set<string> } | undefined
  let nextRun = 0

  const globals = new Map<string, unknown>([
    ["env", trackedEnv(scope, slot)],
    ["View", View],
    ["Run", Run],
    ["Automerge", Automerge],
  ])

  return {
    reserved: new Set(globals.keys()),
    has: (key) => globals.has(key) || slot(key) !== undefined,
    get: (key) => (globals.has(key) ? globals.get(key) : slot(key)),
    adapt: (value) => (isDocBacked(value) ? documentOf(value).snapshot : undefined),
    declared(key, value) {
      scope.put(key, value)
      const known = untrack(names)
      const named = isDocBacked(value) ? value.url : typeof value === "object" && value !== null ? value : undefined
      if (named !== undefined && known.get(named) !== key) setNames(known.set(named, key))
    },
    run(formula, fn) {
      const previous = active
      const run = (active = { formula, asked: new Set() })
      try {
        const value = fn()
        for (const [key, thing] of kept.get(formula) ?? []) {
          if (run.asked.has(key)) continue
          thing.dispose()
          kept.get(formula)!.delete(key)
        }
        return value
      } finally {
        active = previous
      }
    },
    nameOf: (urlOrValue) => names().get(urlOrValue),
    destroy() {
      for (const own of kept.values()) for (const thing of own.values()) thing.dispose()
      for (const thing of loose) thing.dispose()
      for (const stop of stops) stop()
      scope.destroy()
    },
  }

  /** The value visible at `key` from the explanation's scope, as a signal. */
  function slot(key: string): unknown {
    let read = slots.get(key)
    if (!read) {
      const handle = scope.get(key)
      const [value, setValue] = createSignal<unknown>(handle.value)
      const update = () => setValue(() => handle.value)
      stops.push(scope.subscribe(update), handle.subscribe(update))
      slots.set(key, (read = value))
    }
    return read()
  }

  /** The document's scope, made on first sight, with `data` bound to it. */
  function documentOf(handle: DocBacked): DocumentScope {
    const known = documents.get(handle.url)
    if (known) return known
    const [snapshot, setSnapshot] = createSignal<unknown>(undefined, { equals: false })
    const own = scope.fork(`document ${handle.url.replace(/^automerge:/, "")}`)
    const found = { scope: own, snapshot }
    documents.set(handle.url, found)
    own.put("data", handle)
    stops.push(
      handle.subscribe((doc) => {
        if (typeof doc === "object" && doc !== null) handles.set(doc, handle)
        setSnapshot(() => doc)
      }),
    )
    return found
  }

  /** Where a view or a run on `value` goes: below a run's scope, a document's, or the explanation's. */
  function targetOf(value: unknown): Target {
    const run = typeof value === "object" && value !== null ? runs.get(value) : undefined
    if (run) return { handle: run.handle, scope: run.scope, key: `run ${run.id}`, run: true }
    const handle = handleOf(value)
    if (handle) return { handle, scope: documentOf(handle).scope, key: handle.url, run: false }
    return { handle: undefined, scope, key: identity(value), run: false }
  }

  function handleOf(value: unknown): DocBacked | undefined {
    return isDocBacked(value) ? value : typeof value === "object" && value !== null ? handles.get(value) : undefined
  }

  /** What a formula asks for, kept for as long as it keeps asking: the same key gets the same thing back. */
  function keep<T>(key: string, make: () => Kept<T>): T {
    if (!active) {
      const thing = make()
      loose.push(thing)
      return thing.value
    }
    let own = kept.get(active.formula)
    if (!own) kept.set(active.formula, (own = new Map()))
    active.asked.add(key)
    let thing = own.get(key)
    if (!thing) own.set(key, (thing = make()))
    return thing.value as T
  }

  /** Mounts the view at `url` on `data`. A formula that asks again for the same mount gets the same node. */
  function View(url: string, data: unknown, props: Props = {}): Node {
    const target = targetOf(data)
    return keep(`view ${JSON.stringify([url, target.key, props])}`, () => mountView(url, target, data, props))
  }

  /**
   * Runs the behavior at `url` on `document` (a document, or a run), in a scope
   * of its own with `props` bound as slots. Asked again for the same run, it
   * returns the same one: a promise of the run, which reads as what the
   * behavior did and draws itself.
   */
  function Run(url: string, document: unknown, props: Props = {}): Promise<RunValue> {
    const target = targetOf(document)
    if (!target.handle) throw new Error("Run(behavior, document) needs a document or a run")
    const key = `run ${JSON.stringify([url, target.key, Object.entries(props).map(([k, v]) => [k, keyOf(v)])])}`
    return keep(key, () => startRun(url, target as Target & { handle: DocBacked }, props))
  }

  function keyOf(value: unknown): string {
    return targetOf(value).key
  }

  function startRun(url: string, target: Target & { handle: DocBacked }, props: Props): Kept<Promise<RunValue>> {
    const own = target.scope.fork("run")
    for (const [key, value] of Object.entries(props)) own.put(key, handleOf(value) ?? value)
    const [record, setRecord] = createSignal<BehaviorRun>()
    const value = runValue(record, url, target.handle.url)
    runs.set(value, { scope: own, handle: target.handle, id: nextRun++ })
    let gone = false
    const started = runtime.load<Behavior>(url).then((behavior) => {
      if (gone) return value
      untrack(() =>
        own.attach(
          recording(behavior, url, target.handle.url, (run) => setRecord(run)),
          url,
        ),
      )
      return value
    })
    return {
      value: started,
      dispose() {
        gone = true
        own.destroy()
      },
    }
  }

  /** A view in a scope of its own, below what it was given; `name` is bound to the name that has, if any. */
  function mountView(url: string, target: Target, data: unknown, props: Props): Kept<Node> {
    const node = document.createElement("div")
    node.className = "view"
    node.append(spinner())
    const own = target.scope.fork("view")
    if (!target.handle) own.put("data", data)
    own.put("name", untrack(names).get(target.handle && !target.run ? target.handle.url : data))
    const env = readOnly(own)
    let gone = false
    let disposeView: (() => void) | undefined
    runtime
      .load<View>(url)
      .then((view) => {
        if (gone) return
        createRoot((dispose) => {
          disposeView = dispose
          node.replaceChildren(view(env, props))
        })
      })
      .catch((error) => {
        if (!gone) node.replaceChildren(failure(error))
      })
    return {
      value: node,
      dispose() {
        gone = true
        disposeView?.()
        own.destroy()
      },
    }
  }
}

/** The explanation's scope as `env` in a formula: reads are tracked, puts are refused. */
function trackedEnv(scope: Env, slot: (key: string) => unknown) {
  return {
    get id() {
      return scope.id
    },
    get(key: string) {
      const handle = scope.get(key)
      return {
        get value() {
          return slot(key)
        },
        get url() {
          return handle.url
        },
        change: handle.change,
        subscribe: handle.subscribe,
      }
    },
    entries: () => scope.entries(),
    put(): never {
      throw new Error("formulas declare instead of putting")
    },
  }
}

/** The scope as a view sees it: everything but the ways to change it. */
function readOnly(env: Env): Env {
  const refuse = (): never => {
    throw new Error("views don't put")
  }
  return {
    get id() {
      return env.id
    },
    get parent() {
      return env.parent
    },
    get forks() {
      return env.forks
    },
    get behaviors() {
      return env.behaviors
    },
    get: (key) => env.get(key),
    entries: () => env.entries(),
    conflicts: (key) => env.conflicts(key),
    put: refuse,
    choose: refuse,
    attach: refuse,
    detach: refuse,
    fork: refuse,
    destroy: refuse,
    subscribe: (fn) => env.subscribe(fn),
    lookup: (id) => env.lookup(id),
  }
}

const identities = new WeakMap<object, number>()
let nextIdentity = 0

/** Something that tells values apart for a mount's key: objects by identity, everything else by value. */
function identity(value: unknown): string {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return `${typeof value}:${String(value)}`
  let id = identities.get(value)
  if (id === undefined) identities.set(value, (id = nextIdentity++))
  return `object:${id}`
}

function spinner(): HTMLElement {
  const element = document.createElement("span")
  element.className = "spinner"
  return element
}

function failure(error: unknown): HTMLElement {
  const element = document.createElement("span")
  element.className = "value-error"
  element.textContent = error instanceof Error ? error.message : String(error)
  if (error instanceof Error && error.stack) element.title = error.stack
  return element
}
