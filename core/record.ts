// What a behavior did in its last run on a document: the keys it asked for,
// what it put, the documents it created and the paths it changed in any
// document, with their values now. `recording` wraps the behavior's run; the
// behavior sees the same environment, and its repo, as before.

import * as Automerge from "@automerge/automerge"
import type { Env, Run } from "./environment"
import { walk, type DocBacked, type Handle } from "./handle"
import type { Repo } from "./repo"

/** Keys in the order they read best: what ran where, then what it read, then what it wrote. */
export type BehaviorRun = {
  behavior: string
  document: string
  /** Every key the run asked its environment for, in order. */
  reads: string[]
  puts: { key: string; value: unknown }[]
  /** The urls of the documents it created. */
  creates: string[]
  /** Every path it changed, in the document at `document`, with the value there now. */
  writes: { document: string; path: string[]; value: unknown }[]
  error?: string
}

/** `run`, reporting each of its runs from the start, and again whenever the run reads or writes. */
export function recording(run: Run, behavior: string, document: DocBacked, report: (run: BehaviorRun) => void): Run {
  let latest = 0
  return (env) => {
    const id = ++latest
    let current: BehaviorRun = { behavior, document: document.url, reads: [], puts: [], creates: [], writes: [] }
    const update = (next: Partial<BehaviorRun>) => {
      if (id !== latest) return
      current = { ...current, ...next }
      report(current)
    }
    const note: Notes = {
      read: (key) => current.reads.includes(key) || update({ reads: [...current.reads, key] }),
      put: (key, value) => update({ puts: [...current.puts.filter((put) => put.key !== key), { key, value }] }),
      create: (url) => update({ creates: [...current.creates, url] }),
      write: (url, paths, doc) => {
        const same = (write: BehaviorRun["writes"][number]) =>
          write.document === url && paths.some((path) => path.join("/") === write.path.join("/"))
        const written = paths.map((path) => ({ document: url, path, value: walk(doc, path) }))
        update({ writes: [...current.writes.filter((write) => !same(write)), ...written] })
      },
    }
    report(current)
    try {
      return run(recordingEnv(env, document, note))
    } catch (error) {
      update({ error: String((error as Error)?.message ?? error) })
      throw error
    }
  }
}

type Notes = {
  read(key: string): void
  put(key: string, value: unknown): void
  create(url: string): void
  write(url: string, paths: string[][], doc: unknown): void
}

/** The environment as the behavior sees it, with every `get` and `put` noted, and every change to a document. */
function recordingEnv(env: Env, document: DocBacked, note: Notes): Env {
  const recorder = Object.create(env) as Env
  recorder.get = <T>(key: string) => {
    note.read(key)
    const handle = env.get<T>(key)
    return {
      get value() {
        const value = handle.value
        return (isRepo(value) ? recordingRepo(value, note) : value) as T
      },
      get url() {
        return handle.url
      },
      change: (fn) => (handle.url === document.url ? changing(document, note, () => handle.change(fn)) : handle.change(fn)),
      subscribe: (fn) => handle.subscribe(fn),
    } satisfies Handle<T>
  }
  recorder.put = <T>(key: string, value: T | Handle<T>) => {
    note.put(key, value)
    return env.put(key, value)
  }
  return recorder
}

function recordingRepo(repo: Repo, note: Notes): Repo {
  const created = <T>(handle: DocBacked<T>) => {
    note.create(handle.url)
    return recordingDoc(handle, note)
  }
  return {
    create: (init) => created(repo.create(init)),
    import: (binary) => created(repo.import(binary)),
    find: <T>(url: string) => repo.find<T>(url).then((handle) => recordingDoc(handle, note)),
  }
}

function recordingDoc<T>(handle: DocBacked<T>, note: Notes): DocBacked<T> {
  return {
    doc: handle.doc,
    url: handle.url,
    get value() {
      return handle.value
    },
    change: (fn) => changing(handle, note, () => handle.change(fn)),
    subscribe: (fn) => handle.subscribe(fn),
  }
}

/** Runs `change` on `handle`'s document and notes the paths it wrote: lists and text count as a whole. */
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
  if (paths.size) note.write(handle.url, [...paths.values()], after)
}

function isRepo(value: unknown): value is Repo {
  const repo = value as Repo | undefined
  return typeof repo?.create === "function" && typeof repo.find === "function" && typeof repo.import === "function"
}
