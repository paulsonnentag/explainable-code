// The environment, as formulas see it. The explanation gets a scope of its
// own; every document a formula resolves to gets a scope below it, with the
// explanation's behaviors attached; `View` mounts a view by url on a scope.

import * as Automerge from "@automerge/automerge"
import { createRoot, createSignal, untrack, type Accessor } from "solid-js"
import type { Env, Run } from "./environment"
import type { Host as Evaluator } from "./evaluate"
import { isHandle, type DocBacked } from "./handle"
import type { Load } from "./loader"

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
  /** What a node `View` returned shows. */
  viewOf(node: Node): Shows | undefined
  destroy(): void
}

/** The view's url, and what it was given: a document's url, or the value itself. */
export type Shows = { view: string; document: string | undefined; data: unknown }

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
  const shown = new WeakMap<Node, Shows>()
  let active: { formula: number; asked: Set<string> } | undefined

  const globals = new Map<string, unknown>([
    ["env", trackedEnv(scope, slot)],
    ["View", View],
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
    viewOf: (node) => shown.get(node),
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
      for (const behavior of behaviors) own.attach(behavior.run, behavior.url)
    })
    stops.push(
      handle.subscribe((doc) => {
        if (typeof doc === "object" && doc !== null) handles.set(doc, handle)
        setSnapshot(() => doc)
      }),
    )
    return found
  }

  /** Mounts the view at `url` on `data`. A formula that asks again for the same mount gets the same node. */
  function View(url: string, data: unknown, props: Props = {}): Node {
    const handle = isDocBacked(data) ? data : typeof data === "object" && data !== null ? handles.get(data) : undefined
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

  function mountView(url: string, handle: DocBacked | undefined, data: unknown, props: Props): Mount {
    const node = document.createElement("div")
    node.className = "view"
    node.append(spinner())
    shown.set(node, { view: url, document: handle?.url, data })
    const own = handle ? undefined : scope.fork("view")
    own?.put("data", data)
    const env = readOnly(handle ? documentOf(handle).scope : own!)
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
        own?.destroy()
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
