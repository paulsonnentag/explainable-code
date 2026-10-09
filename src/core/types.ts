// The environment's interface.
//
// Reading and writing:
// - A put at `k` is local if anything outside the putter's subtree puts at `k` or below `k`;
//   otherwise it is shared.
// - A shared put is visible in the whole tree. A local put is visible only in its putter's subtree,
//   and puts at or below its key don't cross that subtree's edge in either direction.
// - A read of `k` merges every visible put at `k`, at a prefix of `k`, or below `k`, at read time:
//   shorter keys first, deeper keys over them. Merging needs plain objects.
// - A behavior's environment puts as its host scope; it owns its puts, so destroying it removes them.

export type Env = {
  /** `<parent id>/<name>`; a behavior's environment is `<host id>/<behavior name>`. */
  readonly id: string
  readonly parent: Env | undefined
  /** The behavior that runs in this environment; undefined for the root and for scopes made by `fork`. */
  readonly behavior: Behavior | undefined
  /** Forked scopes and behaviors' environments, in the order they were made. */
  readonly children: Readable<readonly Env[]>
  /** What this environment has put and still owns, in put order, wherever each one landed. */
  readonly ownEntries: Readable<readonly Entry[]>
  /** Keys read during the latest run, then keys subscribed to through this environment's signals. */
  readonly reads: Readable<readonly string[]>
  /** Whether the behavior here did something in its latest run: returned a teardown, or still has puts or forks. False for scopes. */
  readonly applied: Readable<boolean>

  /** A signal on `key` as seen from here, merged at read time. Throws on an empty key. */
  get<T>(key: string): Signal<T | undefined>
  /** Puts `value` at `key`, replacing this environment's earlier put there. Removed when this environment is destroyed or its behavior reruns. Throws on an empty key. */
  put(key: string, value: unknown): void

  /** A child scope. Inside a behavior, destroyed when the run is torn down. */
  fork(name: string): Env
  /** Runs `behavior` in an environment of its own, here and in every scope forked below. Returns the one made here. */
  attach(behavior: Behavior): Env
  /** Removes this environment, its children and every put they made. */
  destroy(): void
}

export type Entry = {
  readonly key: string
  readonly value: unknown
  /** The environment that last set this value; undefined while it is the value that was put. */
  readonly setBy?: Env
}

export type Readable<T> = {
  /** Tracked during a behavior's run. */
  get(): T
  /** Calls `fn` now and whenever the value changes by structural equality. Not tracked. */
  subscribe(fn: (value: T) => void): () => void
}

export type Signal<T> = Readable<T> & {
  /** Writes into the deepest visible put at this key or a prefix of it, attributed to the caller's environment. Throws if nothing provides the key, or if puts below it also contribute. A set value survives reruns of the environment that owns the put. */
  set(next: T): void
  /** `set(fn(get()))`, untracked. */
  update(fn: (value: T) => T): void
}

export type Teardown = () => void
export type Behavior = { readonly name: string; readonly run: (env: Env) => Teardown | void }
