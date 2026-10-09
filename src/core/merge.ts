// The read-time merge: which puts a scope sees at a key, and what they merge to.
// Everything is recomputed from the flat list of puts; nothing is incremental.

/** A put as the merge sees it. */
export type Put = {
  readonly owner: object
  readonly key: readonly string[]
  readonly value: unknown
  /** When it was put: at the same key length, later puts go over earlier ones. */
  readonly order: number
  /** The scope it was put as, then every scope above it up to the root. */
  readonly scopes: readonly object[]
}

/** The value at `key` as seen from the scope whose chain of scopes is `reader`. */
export function read(puts: readonly Put[], local: ReadonlySet<Put>, reader: readonly object[], key: readonly string[]): unknown {
  let value: unknown = undefined
  for (const put of relevant(puts, local, reader, key)) {
    value = startsWith(key, put.key)
      ? walk(put.value, key.slice(put.key.length))
      : assoc(value, put.key.slice(key.length), put.value)
  }
  return value
}

/** The put a set at `key` from `reader` writes into: the deepest, latest visible put at `key` or above it. */
export function target(puts: readonly Put[], local: ReadonlySet<Put>, reader: readonly object[], key: readonly string[]): Put {
  const seen = relevant(puts, local, reader, key)
  if (seen.some((put) => put.key.length > key.length))
    throw new Error(`"${key.join("/")}" is merged from several puts; set a key below it`)
  const put = seen.at(-1)
  if (!put) throw new Error(`nothing is put at "${key.join("/")}"`)
  return put
}

/** The puts that are local: something outside the putter's subtree puts at their key or below it. */
export function findLocal(puts: readonly Put[]): Set<Put> {
  return new Set(puts.filter((put) => puts.some((other) => !other.scopes.includes(put.scopes[0]) && startsWith(other.key, put.key))))
}

/** Every put visible from `reader` at `key`, above it or below it, in merge order: shorter keys first, then earlier puts. */
function relevant(puts: readonly Put[], local: ReadonlySet<Put>, reader: readonly object[], key: readonly string[]): Put[] {
  return puts
    .filter((put) => (startsWith(key, put.key) || startsWith(put.key, key)) && isVisible(put, local, reader))
    .sort((a, b) => a.key.length - b.key.length || a.order - b.order)
}

/** Whether `put` is visible from `reader`: no local put at its key or above it has exactly one of the two in its putter's subtree. */
function isVisible(put: Put, local: ReadonlySet<Put>, reader: readonly object[]): boolean {
  for (const blocker of local) {
    if (!startsWith(put.key, blocker.key)) continue
    const scope = blocker.scopes[0]
    if (put.scopes.includes(scope) !== reader.includes(scope)) return false
  }
  return true
}

/** Splits a key into its path; throws on an empty key or an empty segment. */
export function parseKey(key: string): string[] {
  const path = key.split("/")
  if (path.some((segment) => segment === "")) throw new Error(`"${key}" is not a key`)
  return path
}

/** Whether `key` is `prefix` or below it. */
export function startsWith(key: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= key.length && prefix.every((segment, i) => key[i] === segment)
}

/** The value at `path` inside `value`; undefined if anything on the way is missing. */
export function walk(value: unknown, path: readonly string[]): unknown {
  for (const segment of path) {
    if (value === null || typeof value !== "object") return undefined
    value = (value as Record<string, unknown>)[segment]
  }
  return value
}

/** A copy of `target` with `value` at `path`; anything on the way that isn't a plain object becomes one. */
export function assoc(target: unknown, path: readonly string[], value: unknown): unknown {
  if (path.length === 0) return value
  const [head, ...rest] = path
  if (Array.isArray(target)) {
    const copy = [...target]
    copy[Number(head)] = assoc(copy[Number(head)], rest, value)
    return copy
  }
  const base = isPlain(target) ? (target as Record<string, unknown>) : {}
  return { ...base, [head]: assoc(base[head], rest, value) }
}

/** Structural equality over plain objects and arrays; identity for everything else, such as elements. */
export function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!isPlain(a) || !isPlain(b) || Array.isArray(a) !== Array.isArray(b)) return false
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  const keys = Object.keys(x)
  return keys.length === Object.keys(y).length && keys.every((k) => Object.hasOwn(y, k) && equal(x[k], y[k]))
}

function isPlain(value: unknown): boolean {
  if (Array.isArray(value)) return true
  if (value === null || typeof value !== "object") return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
