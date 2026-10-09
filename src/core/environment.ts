// The environment: a tree of scopes holding puts, with one environment per attached behavior.
// See types.ts for the rules. Every read merges from scratch; see merge.ts.

import { assoc, equal, findLocal, parseKey, read, target, type Put } from "./merge"
import type { Behavior, Entry, Env, Readable, Signal, Teardown } from "./types"

/** A fresh root scope. */
export function createEnvironment(): Env {
  return new Environment(undefined, "root", undefined)
}

export function behavior(name: string, run: Behavior["run"]): Behavior {
  return { name, run }
}

/** For the inspector only: the environment with this id in `env`'s tree, as a signal. Everything else gets what it needs through slots. */
export function getEnvironmentById(env: Env, id: string): Readable<Env | undefined> {
  const world = (env as Environment).world
  return new Derived(world, () => world.byId(id))
}

const RERUNS = 100 // reruns of one behavior within a macrotask before it is left alone

class Environment implements Env {
  readonly id: string
  readonly parent: Environment | undefined
  readonly behavior: Behavior | undefined
  readonly world: World
  readonly children: Readable<readonly Env[]>
  readonly ownEntries: Readable<readonly Entry[]>
  readonly reads: Readable<readonly string[]>
  readonly applied: Readable<boolean>
  #children = new Set<Environment>()
  #puts = new Map<string, { value: unknown; order: number }>()
  /** Set values, by the key of the put they were written into; they win over this environment's later puts there. */
  #sets = new Map<string, { value: unknown; by: Environment }>()
  /** Behaviors attached here; a scope's forks get them too. */
  #attached: Behavior[] = []
  #runner: Runner | undefined
  /** Keys read during the latest run. */
  #tracked: string[] = []
  /** Whether the latest run returned a teardown. */
  #returned = false
  /** Keys with live subscriptions through this environment's signals, and how many. */
  #subscribed = new Map<string, number>()
  #destroyed = false

  constructor(parent: Environment | undefined, id: string, behavior: Behavior | undefined) {
    this.parent = parent
    this.id = id
    this.behavior = behavior
    this.world = parent?.world ?? new World(this)
    this.world.register(this)
    this.children = new Derived(this.world, () => [...this.#children])
    this.ownEntries = new Derived(this.world, () => [...this.#puts].map(([key, put]) => this.entry(key, put.value)))
    this.reads = new Derived(this.world, () => [...new Set([...this.#tracked, ...this.#subscribed.keys()])])
    this.applied = new Derived(this.world, () => !!this.behavior && (this.#returned || this.#puts.size > 0 || this.#children.size > 0))
  }

  // -- reading and writing --

  get<T>(key: string): Signal<T | undefined> {
    return new KeySignal<T | undefined>(this, parseKey(key))
  }

  put(key: string, value: unknown): void {
    const k = parseKey(key).join("/")
    if (this.#destroyed) return
    const set = this.#sets.get(k)
    this.#puts.delete(k)
    this.#puts.set(k, { value: set ? set.value : value, order: this.world.nextOrder() })
    this.world.mutated()
  }

  // -- structure --

  fork(name: string): Environment {
    const child = new Environment(this, `${this.id}/${name}`, undefined)
    this.#children.add(child)
    for (const behavior of child.inherited()) child.start(behavior)
    this.world.mutated()
    return child
  }

  attach(behavior: Behavior): Environment {
    const host = this.scope
    host.#attached.push(behavior)
    let made!: Environment
    for (const scope of host.scopesBelow()) {
      const env = scope.start(behavior)
      if (scope === host) made = env
    }
    return made
  }

  destroy(): void {
    if (this.#destroyed) return
    this.world.batch(() => {
      this.#destroyed = true
      for (const child of [...this.#children]) child.destroy()
      this.#runner?.stop()
      this.#puts.clear()
      this.#sets.clear()
      this.#subscribed.clear()
      if (this.parent) this.parent.#children.delete(this)
      this.world.unregister(this)
      this.world.mutated()
    })
  }

  // -- internals --

  /** The scope this environment puts and reads as: itself, or for a behavior's environment, its host. */
  get scope(): Environment {
    return this.behavior ? this.parent!.scope : this
  }

  /** This environment's scope, then every scope above it. */
  chain(): Environment[] {
    const out: Environment[] = []
    for (let scope: Environment | undefined = this.scope; scope; scope = scope.parent?.scope) out.push(scope)
    return out
  }

  /** The merged value at `key`, as seen from here. */
  read(key: readonly string[]): unknown {
    return this.world.read(this.scope, key)
  }

  /** Writes `next` at `key` into the put that provides it, and records the set as made here. */
  write(key: readonly string[], next: unknown): void {
    const { puts, local } = this.world.snapshot()
    const put = target(puts, local, this.chain(), key)
    const owner = put.owner as Environment
    owner.overwrite(put.key.join("/"), assoc(put.value, key.slice(put.key.length), next), this)
    this.world.mutated()
  }

  /** Replaces the value of this environment's put at `key`, keeping its place in the order. */
  overwrite(key: string, value: unknown, by: Environment): void {
    const put = this.#puts.get(key)
    if (!put) return
    put.value = value
    this.#sets.set(key, { value, by })
  }

  /** Every put in this environment and below, for the merge. */
  collect(out: Put[] = []): Put[] {
    const scopes = this.chain()
    for (const [key, put] of this.#puts) out.push({ owner: this, key: key.split("/"), value: put.value, order: put.order, scopes })
    for (const child of this.#children) child.collect(out)
    return out
  }

  /** Drops what the last run left: its puts and its forks. Set values stay. */
  reset(): void {
    for (const child of [...this.#children]) child.destroy()
    this.#puts.clear()
    this.world.mutated()
  }

  /** What the latest run read, and whether it returned a teardown. */
  recordRun(reads: string[], returned: boolean): void {
    this.#tracked = reads
    this.#returned = returned
    this.world.mutated()
  }

  /** One more (or one fewer) live subscription to `key` through this environment's signals. */
  subscribed(key: string, delta: number): void {
    if (this.#destroyed) return
    const count = (this.#subscribed.get(key) ?? 0) + delta
    if (count > 0) this.#subscribed.set(key, count)
    else this.#subscribed.delete(key)
    this.world.mutated()
  }

  private entry(key: string, value: unknown): Entry {
    const set = this.#sets.get(key)
    return set ? { key, value, setBy: set.by } : { key, value }
  }

  /** Runs `behavior` in a new environment under this scope; the first run waits a microtask, so it sees puts made right after a fork. */
  private start(behavior: Behavior): Environment {
    const env = new Environment(this, `${this.id}/${behavior.name}`, behavior)
    this.#children.add(env)
    const runner = new Runner(env, behavior)
    env.#runner = runner
    this.world.mutated()
    queueMicrotask(() => runner.run())
    return env
  }

  /** The behaviors attached to the scopes above this one, outermost first. */
  private inherited(): Behavior[] {
    const out: Behavior[] = []
    for (let scope = this.parent?.scope; scope; scope = scope.parent?.scope) out.unshift(...scope.#attached)
    return out
  }

  /** This scope and every scope below it, including forks made by behaviors. */
  private *scopesBelow(): Generator<Environment> {
    if (!this.behavior) yield this
    for (const child of this.#children) yield* child.scopesBelow()
  }
}

/** Something a behavior's run can read: tracked by `get`, recomputed by `peek`. */
abstract class Source<T> implements Readable<T> {
  constructor(readonly world: World) {}

  abstract peek(): T

  get(): T {
    const value = this.peek()
    tracking?.push(this)
    return value
  }

  subscribe(fn: (value: T) => void): () => void {
    let last = this.peek()
    untracked(() => fn(last))
    return this.world.react(() => {
      const value = this.peek()
      if (equal(value, last)) return
      last = value
      untracked(() => fn(value))
    })
  }
}

/** A signal on one key as seen from one environment, which its reads and sets are attributed to. */
class KeySignal<T> extends Source<T> implements Signal<T> {
  constructor(
    readonly env: Environment,
    readonly key: readonly string[],
  ) {
    super(env.world)
  }

  peek(): T {
    return this.env.read(this.key) as T
  }

  set(next: T): void {
    this.env.write(this.key, next)
  }

  update(fn: (value: T) => T): void {
    this.set(fn(this.peek()))
  }

  subscribe(fn: (value: T) => void): () => void {
    const key = this.key.join("/")
    this.env.subscribed(key, 1)
    const stop = super.subscribe(fn)
    return () => {
      stop()
      this.env.subscribed(key, -1)
    }
  }
}

/** A value computed from the tree, recomputed on every read. */
class Derived<T> extends Source<T> {
  constructor(
    world: World,
    readonly compute: () => T,
  ) {
    super(world)
  }

  peek(): T {
    return this.compute()
  }
}

/** Runs a behavior in its environment, and again when what it read changes. */
class Runner {
  #teardown: Teardown | undefined
  #reads: { source: Source<unknown>; value: unknown }[] = []
  #stopReacting: (() => void) | undefined
  #scheduled = false
  #stopped = false
  #burst = 0 // reruns since the last macrotask, to catch behaviors that feed each other
  #cooling: ReturnType<typeof setTimeout> | undefined

  constructor(
    readonly env: Environment,
    readonly behavior: Behavior,
  ) {}

  /** One run: the last run's teardown, puts and forks go first, so a run starts clean. */
  run(): void {
    if (this.#stopped) return
    this.env.world.batch(() => {
      this.#stopReacting?.()
      this.#callTeardown()
      this.env.reset()
      const reads: Source<unknown>[] = []
      const result = track(reads, () => {
        try {
          return this.behavior.run(this.env)
        } catch (error) {
          console.error(`[environment] ${this.env.id} failed`, error)
        }
      })
      this.#teardown = typeof result === "function" ? result : undefined
      // Recorded after the run, so a behavior's own puts don't rerun it.
      this.#reads = reads.map((source) => ({ source, value: source.peek() }))
      const keys = reads.flatMap((source) => (source instanceof KeySignal ? [source.key.join("/")] : []))
      this.env.recordRun([...new Set(keys)], this.#teardown !== undefined)
      this.#stopReacting = this.env.world.react(() => this.#check())
    })
  }

  stop(): void {
    if (this.#stopped) return
    this.#stopped = true
    this.#stopReacting?.()
    clearTimeout(this.#cooling)
    this.#callTeardown()
  }

  #check(): void {
    if (this.#scheduled || this.#stopped) return
    if (this.#reads.every((read) => equal(read.source.peek(), read.value))) return
    this.#scheduled = true
    queueMicrotask(() => {
      this.#scheduled = false
      if (this.#stopped) return
      if (++this.#burst > RERUNS) {
        console.error(`[environment] ${this.env.id} keeps rerunning; left as is until the next change`)
        this.#burst = 0
        return
      }
      this.#cooling ??= setTimeout(() => {
        this.#burst = 0
        this.#cooling = undefined
      })
      this.run()
    })
  }

  #callTeardown(): void {
    const teardown = this.#teardown
    this.#teardown = undefined
    try {
      teardown?.()
    } catch (error) {
      console.error(`[environment] teardown of ${this.env.id} failed`, error)
    }
  }
}

/** What one environment tree shares: the order of puts, the merge's cache, environments by id, and who to tell about changes. */
class World {
  #order = 0
  #version = 0
  #snapshot: { version: number; puts: Put[]; local: Set<Put> } | undefined
  #reads = new Map<Environment, Map<string, unknown>>()
  #byId = new Map<string, Environment>()
  #reactions = new Set<() => void>()
  #depth = 0
  #pending = false
  #flushing = false

  constructor(readonly root: Environment) {}

  nextOrder(): number {
    return ++this.#order
  }

  register(env: Environment): void {
    this.#byId.set(env.id, env)
  }

  unregister(env: Environment): void {
    if (this.#byId.get(env.id) === env) this.#byId.delete(env.id)
  }

  byId(id: string): Environment | undefined {
    return this.#byId.get(id)
  }

  /** Every put in the tree and which of them are local, recomputed after any change. */
  snapshot(): { puts: Put[]; local: Set<Put> } {
    if (this.#snapshot?.version !== this.#version) {
      const puts = this.root.collect()
      this.#snapshot = { version: this.#version, puts, local: findLocal(puts) }
      this.#reads.clear()
    }
    return this.#snapshot
  }

  /** The merged value at `key` from `scope`, remembered until the next change. */
  read(scope: Environment, key: readonly string[]): unknown {
    const { puts, local } = this.snapshot()
    let reads = this.#reads.get(scope)
    if (!reads) this.#reads.set(scope, (reads = new Map()))
    const k = key.join("/")
    if (!reads.has(k)) reads.set(k, read(puts, local, scope.chain(), key))
    return reads.get(k)
  }

  /** Something changed: every reaction checks again, once the outermost batch is done. */
  mutated(): void {
    this.#version++
    this.#pending = true
    if (this.#depth === 0) this.#flush()
  }

  batch<T>(fn: () => T): T {
    this.#depth++
    try {
      return fn()
    } finally {
      this.#depth--
      if (this.#depth === 0) this.#flush()
    }
  }

  /** Calls `fn` after every change, until the returned function is called. */
  react(fn: () => void): () => void {
    this.#reactions.add(fn)
    return () => {
      this.#reactions.delete(fn)
    }
  }

  /** Runs the reactions until nothing they did changed anything again. */
  #flush(): void {
    if (this.#flushing) return
    this.#flushing = true
    try {
      while (this.#pending) {
        this.#pending = false
        for (const fn of [...this.#reactions]) {
          if (!this.#reactions.has(fn)) continue
          try {
            fn()
          } catch (error) {
            console.error("[environment] a subscriber failed", error)
          }
        }
      }
    } finally {
      this.#flushing = false
    }
  }
}

/** The sources read by the behavior run on the stack; undefined outside runs and inside callbacks. */
let tracking: Source<unknown>[] | undefined

function track<T>(reads: Source<unknown>[], fn: () => T): T {
  const previous = tracking
  tracking = reads
  try {
    return fn()
  } finally {
    tracking = previous
  }
}

function untracked<T>(fn: () => T): T {
  const previous = tracking
  tracking = undefined
  try {
    return fn()
  } finally {
    tracking = previous
  }
}
