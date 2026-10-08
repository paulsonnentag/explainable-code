// What a behavior did in its last run: the keys it asked for and what was
// there, what it put, the documents it created, and the paths it changed in
// any document, with their values now. `recording` wraps the behavior's run;
// the behavior sees the same environment, and its repo, as before.

import * as Automerge from "@automerge/automerge"
import type { Env, Run } from "./environment"
import { isDocBacked, walk, type DocBacked, type Handle } from "./handle"
import type { Repo } from "./repo"

export type BehaviorRun = {
  behavior: string
  /** The url of the document it ran on. */
  document: string
  /** Every key the run asked its environment for, in order, with the value there when it asked. */
  reads: { key: string; value: unknown }[]
  puts: { key: string; value: unknown }[]
  /** The documents it created, with what they held when created. */
  creates: { document: string; value: unknown }[]
  /** Every path it changed, in the document at `document`, with the value there now. */
  writes: { document: string; path: string[]; value: unknown }[]
  error?: string
}

type Write = BehaviorRun["writes"][number]

/** `run`, reporting each of its runs from the start, and again whenever the run reads or writes. */
export function recording(run: Run, behavior: string, document: string, report: (run: BehaviorRun) => void): Run {
  let latest = 0
  return (env) => {
    const id = ++latest
    let current: BehaviorRun = { behavior, document, reads: [], puts: [], creates: [], writes: [] }
    const update = (next: Partial<BehaviorRun>) => {
      if (id !== latest) return
      current = { ...current, ...next }
      report(current)
    }
    const note: Notes = {
      read(key, value) {
        if (!current.reads.some((read) => read.key === key)) update({ reads: [...current.reads, { key, value }] })
      },
      put: (key, value) => update({ puts: [...current.puts.filter((put) => put.key !== key), { key, value }] }),
      create: (url, value) => update({ creates: [...current.creates, { document: url, value }] }),
      write(url, paths, doc) {
        const writes = [...current.writes]
        for (const path of paths) {
          const write: Write = { document: url, path, value: walk(doc, path) }
          const at = writes.findIndex((known) => known.document === url && known.path.join("/") === path.join("/"))
          if (at < 0) writes.push(write)
          else writes[at] = write
        }
        update({ writes })
      },
    }
    report(current)
    try {
      return run(recordingEnv(env, note))
    } catch (error) {
      update({ error: String((error as Error)?.message ?? error) })
      throw error
    }
  }
}

type Notes = {
  read(key: string, value: unknown): void
  put(key: string, value: unknown): void
  create(url: string, value: unknown): void
  write(url: string, paths: string[][], doc: unknown): void
}

/** What the recording handles stand in for, so a handle the behavior puts is the real one. */
const originals = new WeakMap<object, DocBacked>()

/** The environment as the behavior sees it, with every `get` and `put` noted, and every change to a document. */
function recordingEnv(env: Env, note: Notes): Env {
  const untracked = env.lookup(env.id)
  const recorder = Object.create(env) as Env
  recorder.get = <T>(key: string) => {
    note.read(key, untracked?.get(key).value)
    const handle = env.get<T>(key)
    return {
      get value() {
        const value = handle.value
        return (isRepo(value) ? recordingRepo(value, note) : value) as T
      },
      get url() {
        return handle.url
      },
      change(fn) {
        const document = documentAt(env, key)
        if (document) changing(document, note, () => handle.change(fn))
        else handle.change(fn)
      },
      subscribe: (fn) => handle.subscribe(fn),
    } satisfies Handle<T>
  }
  recorder.put = <T>(key: string, value: T | Handle<T>) => {
    note.put(key, value)
    const original = typeof value === "object" && value !== null ? originals.get(value) : undefined
    return env.put(key, (original ?? value) as T | Handle<T>)
  }
  return recorder
}

/** The document bound where `key` resolves, if a document is bound there. */
function documentAt(env: Env, key: string): DocBacked | undefined {
  const candidates = env.conflicts(key)
  const visible = candidates.find((candidate) => candidate.chosen) ?? candidates[candidates.length - 1]
  return visible && isDocBacked(visible.handle) ? visible.handle : undefined
}

function recordingRepo(repo: Repo, note: Notes): Repo {
  const created = <T>(handle: DocBacked<T>) => {
    note.create(handle.url, handle.value)
    return recordingDoc(handle, note)
  }
  return {
    create: (init) => created(repo.create(init)),
    import: (binary) => created(repo.import(binary)),
    clone: (url) => created(repo.clone(url)),
    find: <T>(url: string) => repo.find<T>(url).then((handle) => recordingDoc(handle, note)),
  }
}

function recordingDoc<T>(handle: DocBacked<T>, note: Notes): DocBacked<T> {
  const recorded: DocBacked<T> = {
    doc: handle.doc,
    url: handle.url,
    get value() {
      return handle.value
    },
    change: (fn) => changing(handle as DocBacked, note, () => handle.change(fn)),
    subscribe: (fn) => handle.subscribe(fn),
  }
  originals.set(recorded, handle as DocBacked)
  return recorded
}

/**
 * Runs `change` on `handle`'s document and notes the paths it wrote, outermost
 * only: a new object counts as one write, and so does any change to a list or
 * a string.
 */
function changing(handle: DocBacked, note: Notes, change: () => void): void {
  const before = Automerge.getHeads(handle.value as Automerge.Doc<unknown>)
  change()
  const after = handle.value as Automerge.Doc<unknown>
  const paths = new Map<string, string[]>()
  for (const patch of Automerge.diff(after, before, Automerge.getHeads(after))) {
    const cut = patch.path.findIndex((step) => typeof step === "number")
    const path = (cut < 0 ? patch.path : patch.path.slice(0, cut)).map(String)
    paths.set(path.join("/"), path)
  }
  const outermost = [...paths.values()].filter(
    (path) => ![...paths.values()].some((other) => other.length < path.length && other.every((step, i) => step === path[i])),
  )
  if (outermost.length) note.write(handle.url, outermost, after)
}

function isRepo(value: unknown): value is Repo {
  const repo = value as Repo | undefined
  return typeof repo?.create === "function" && typeof repo.find === "function" && typeof repo.clone === "function"
}
