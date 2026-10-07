// The environment, as formulas see it. The explanation gets a scope of its
// own; every document a formula resolves to gets a scope below it, with the
// explanation's behaviors attached and their runs recorded; `View` mounts a
// view by url on a scope of its own, and `Run` reads a recorded run.

import * as Automerge from "@automerge/automerge"
import { createRoot, createSignal, untrack, type Accessor, type Setter } from "solid-js"
import type { Env, Run } from "./environment"
import type { Host as Evaluator } from "./evaluate"
import { isHandle, type DocBacked } from "./handle"
import type { Load } from "./loader"
import { recording, type BehaviorRun } from "./record"

/** What the app gives the core: the root scope, holding `repo`, and how urls load. */
export type Runtime = { root: Env; load: Load }

/** A view's default export: called once per mount, inside a Solid root. */
export type View = (env: Env, props: Props) => Node

export type Props = Record<string, unknown>

/** A behavior from the frontmatter, loaded. */
export type Loaded = { url: string; run: Run }

export type Host = Evaluator & {
  /** The name declared for a document's url, or for an object a declaration resolved to. Tracked. */
  nameOf(urlOrValue: unknown): string | undefined
  destroy(): void
}

type DocumentScope = { scope: Env; snapshot: Accessor<unknown> }
type Mount = { node: Node; dispose(): void }

export function createHost(runtime: Runtime, behaviors: Loaded[], name: string): Host {
  const scope = runtime.root.fork(name)
  const stops: (() => void)[] = []
  const slots = new Map<string, Accessor<unknown>>()
  const documents = new Map<string, DocumentScope>()
  const handles = new WeakMap<object, DocBacked>()
  const [names, setNames] = createSignal(new Map<unknown, string>(), { equals: false })
  const mounts = new Map<number, Map<string, Mount>>()
  const loose: Mount[] = []
  const runs = new Map<string, [Accessor<BehaviorRun | undefined>, Setter<BehaviorRun | undefined>]>()
  let active: { formula: number; asked: Set<string> } | undefined

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
        for (const [key, mount] of mounts.get(formula) ?? []) {
          if (run.asked.has(key)) continue
          mount.dispose()
          mounts.get(formula)!.delete(key)
        }
        return value
      } finally {
        active = previous
      }
    },
    nameOf: (urlOrValue) => names().get(urlOrValue),
    destroy() {
      for (const own of mounts.values()) for (const mount of own.values()) mount.dispose()
      for (const mount of loose) mount.dispose()
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

  /** The document's scope, made on first sight: the behaviors run once before anyone reads the snapshot. */
  function documentOf(handle: DocBacked): DocumentScope {
    const known = documents.get(handle.url)
    if (known) return known
    const [snapshot, setSnapshot] = createSignal<unknown>(undefined, { equals: false })
    const own = scope.fork(`document ${handle.url.replace(/^automerge:/, "")}`)
    const found = { scope: own, snapshot }
    documents.set(handle.url, found)
    own.put("data", handle)
    untrack(() => {
      for (const behavior of behaviors) {
        const [, setRun] = runOf(handle.url, behavior.url)
        own.attach(
          recording(behavior.run, behavior.url, handle, (run) => setRun(run)),
          behavior.url,
        )
      }
    })
    stops.push(
      handle.subscribe((doc) => {
        if (typeof doc === "object" && doc !== null) handles.set(doc, handle)
        setSnapshot(() => doc)
      }),
    )
    return found
  }

  /** The last run of the behavior at `url` on `document`, as recorded. Tracked. */
  function Run(url: string, document: unknown): BehaviorRun {
    const handle = handleOf(document)
    if (!handle) throw new Error("Run(url, document) needs a document")
    if (!behaviors.some((behavior) => behavior.url === url)) throw new Error(`${url} isn't one of this explanation's behaviors`)
    documentOf(handle)
    return runOf(handle.url, url)[0]()!
  }

  function runOf(document: string, behavior: string) {
    const key = `${document} ${behavior}`
    let run = runs.get(key)
    if (!run) runs.set(key, (run = createSignal<BehaviorRun>()))
    return run
  }

  function handleOf(value: unknown): DocBacked | undefined {
    return isDocBacked(value) ? value : typeof value === "object" && value !== null ? handles.get(value) : undefined
  }

  /** Mounts the view at `url` on `data`. A formula that asks again for the same mount gets the same node. */
  function View(url: string, data: unknown, props: Props = {}): Node {
    const handle = handleOf(data)
    if (!active) {
      const mount = mountView(url, handle, data, props)
      loose.push(mount)
      return mount.node
    }
    const key = JSON.stringify([url, handle ? handle.url : identity(data), props])
    let own = mounts.get(active.formula)
    if (!own) mounts.set(active.formula, (own = new Map()))
    active.asked.add(key)
    let mount = own.get(key)
    if (!mount) own.set(key, (mount = mountView(url, handle, data, props)))
    return mount.node
  }

  /** A view on a scope of its own: below the document's, or holding `data`; with `name` if `data` has one. */
  function mountView(url: string, handle: DocBacked | undefined, data: unknown, props: Props): Mount {
    const node = document.createElement("div")
    node.className = "view"
    node.append(spinner())
    const own = (handle ? documentOf(handle).scope : scope).fork("view")
    if (!handle) own.put("data", data)
    const name = untrack(names).get(handle ? handle.url : data)
    if (name !== undefined) own.put("name", name)
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
      node,
      dispose() {
        gone = true
        disposeView?.()
        own.destroy()
      },
    }
  }
}

export function isDocBacked(value: unknown): value is DocBacked {
  return isHandle(value) && typeof value.url === "string" && "doc" in value
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
