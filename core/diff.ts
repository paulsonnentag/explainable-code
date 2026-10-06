// What the tested behaviors changed. In the example's own documents, that is
// what their writes changed, field by field. Everywhere else, it is a document
// scope in the world with every behavior against the same scope in the world
// with only the dependencies, compared path by path.

import * as A from "@automerge/automerge"
import type { Env } from "./environment"
import { isHandle, walk, type Handle } from "./handle"
import type { Recorded } from "./recording"

export type DiffRow = {
  /** The path that differs, starting with the key it is bound at. */
  path: string
  /** The behaviors that put the key, in put order. */
  by: string[]
  /** The value as JSON; undefined where nothing is there. */
  before?: string
  after?: string
}

/** Keys left out of the diff: the frames already show `dom`. */
const HIDDEN = new Set(["dom"])

/**
 * `docs` are the shown world's copies of the example's documents; their urls
 * are shown as they are. Any other document url is named `<doc 1>`,
 * `<doc 2>`, … in the order it turns up in each world, so documents created
 * during a run read the same in both.
 */
export function diffScopes(shown: Env, baseline: Env, docs: Map<string, Recorded>, tests: Set<string>): DiffRow[] {
  const known = new Set(docs.keys())
  const name = namer(known)
  const rows: DiffRow[] = []
  // Documents first, so a url a tested behavior wrote into one is the first to be named.
  for (const [key, handle] of Object.entries(shown.entries())) {
    const doc = handle.url === undefined ? undefined : docs.get(handle.url)
    if (doc) rows.push(...diffWrites(key, doc, tests, name))
  }
  const after = plainEntries(shown, known, name)
  const before = plainEntries(baseline, known, namer(known))
  for (const key of [...new Set([...Object.keys(after), ...Object.keys(before)])]) {
    const owner = key in after ? shown : baseline
    const by = owner.conflicts(key).flatMap((c) => (c.url ? [c.url] : []))
    for (const change of compare(key, before[key], after[key])) rows.push({ ...change, by })
  }
  return rows
}

/** A value as indented JSON: handles as their url and value, elements and functions named rather than expanded. */
export function preview(value: unknown): string {
  return show(plain(value, (url) => url)) ?? "undefined"
}

/**
 * Calls `fn` (once per frame) when the structure of any of `scopes` changes,
 * or a value bound in one does, or a handle inside such a value does.
 */
export function watchScopes(scopes: Env[], fn: () => void): () => void {
  let stops: (() => void)[] = []
  let scheduled = false
  const changed = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      rewire()
      fn()
    })
  }
  const rewire = () => {
    for (const stop of stops) stop()
    const handles = new Set<Handle>()
    for (const scope of scopes) {
      for (const key of Object.keys(scope.entries())) {
        const handle = scope.get(key)
        handles.add(handle)
        collectHandles(handle.value, handles, new Set())
      }
    }
    stops = [...handles].map((handle) => {
      let priming = true
      const stop = handle.subscribe(() => {
        if (!priming) changed()
      })
      priming = false
      return stop
    })
  }
  const unsubscribes = scopes.map((scope) => scope.subscribe(changed))
  rewire()
  fn()
  return () => {
    for (const stop of [...stops, ...unsubscribes]) stop()
  }
}

/**
 * The fields the tested behaviors' writes changed, under `key`: before their
 * first write to a field, against after their last one.
 */
function diffWrites(key: string, doc: Recorded, tests: Set<string>, name: (url: string) => string): DiffRow[] {
  const current = doc.value as A.Doc<unknown>
  const fields = new Map<string, { path: string[]; from: A.Heads; to: A.Heads; by: Set<string> }>()
  for (const write of doc.writes) {
    if (write.by === undefined || !tests.has(write.by)) continue
    for (const patch of A.diff(current, write.from, write.to)) {
      const path = fieldOf(patch.path)
      const field = fields.get(path.join("/"))
      if (!field) fields.set(path.join("/"), { path, from: write.from, to: write.to, by: new Set([write.by]) })
      else {
        field.to = write.to
        field.by.add(write.by)
      }
    }
  }
  return [...fields.values()].flatMap(({ path, from, to, by }) => {
    const before = show(plain(walk(A.view(current, from), path), name))
    const after = show(plain(walk(A.view(current, to), path), name))
    return before === after ? [] : [{ path: [key, ...path].join("/"), by: [...by], before, after }]
  })
}

/** The field a patch changes: its path without the trailing indices into a text or list. */
function fieldOf(path: A.Prop[]): string[] {
  let end = path.length
  while (end > 0 && typeof path[end - 1] === "number") end--
  return path.slice(0, end).map(String)
}

/** The scope's bindings as plain data, without the hidden keys and the example's documents. */
function plainEntries(scope: Env, known: Set<string>, name: (url: string) => string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, handle] of Object.entries(scope.entries())) {
    if (HIDDEN.has(key) || (handle.url !== undefined && known.has(handle.url))) continue
    out[key] = plain(handle.value, name)
  }
  return out
}

/** Where `before` and `after` differ: down through objects both sides have, whole values below that. */
function compare(path: string, before: unknown, after: unknown): Omit<DiffRow, "by">[] {
  if (isObject(before) && isObject(after) && Array.isArray(before) === Array.isArray(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    return keys.flatMap((key) => compare(`${path}/${key}`, before[key], after[key]))
  }
  const b = show(before)
  const a = show(after)
  return a === b ? [] : [{ path, before: b, after: a }]
}

/** `value` as plain JSON-able data. */
function plain(value: unknown, name: (url: string) => string, stack = new Set<object>()): unknown {
  if (typeof value === "string") return value.startsWith("automerge:") ? name(value) : value
  if (typeof value === "function") return `ƒ ${value.name || "anonymous"}`
  if (value === null || typeof value !== "object") return value
  if (value instanceof Node) return `<${value.nodeName.toLowerCase()}>`
  if (value instanceof Uint8Array) return `(${value.length} bytes)`
  if (stack.has(value)) return "(cycle)"
  stack.add(value)
  try {
    if (isHandle(value)) {
      return { url: value.url === undefined ? undefined : plain(value.url, name), value: plain(value.value, name, stack) }
    }
    if (Array.isArray(value)) return value.map((item) => plain(item, name, stack))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item, name, stack)]))
  } finally {
    stack.delete(value)
  }
}

function namer(known: Set<string>): (url: string) => string {
  const names = new Map<string, string>()
  return (url) => {
    if (known.has(url)) return url
    let found = names.get(url)
    if (!found) names.set(url, (found = `<doc ${names.size + 1}>`))
    return found
  }
}

function collectHandles(value: unknown, out: Set<Handle>, seen: Set<object>): void {
  if (value === null || typeof value !== "object" || value instanceof Node || seen.has(value)) return
  seen.add(value)
  if (isHandle(value)) {
    out.add(value)
    collectHandles(value.value, out, seen)
    return
  }
  for (const item of Object.values(value)) collectHandles(item, out, seen)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object"
}

function show(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value, null, 2)
}
