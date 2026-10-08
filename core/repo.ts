// The repo as the environment carries it: create, find, import and clone, over
// handles. Held in memory: an explanation makes every document it shows, and
// they are gone on reload.

import { Repo as AutomergeRepo, type AutomergeUrl } from "@automerge/automerge-repo"
import { fromDoc, type DocBacked } from "./handle"

export type Repo = {
  create<T>(init: T): DocBacked<T>
  /** The same promise for the same url, so a formula that finds again gets what it had. */
  find<T = unknown>(url: string): Promise<DocBacked<T>>
  /** A document from a saved binary, history included. */
  import<T>(binary: Uint8Array): DocBacked<T>
  /** A new document with the history of the one at `url`, which this repo must have handed out. */
  clone<T = unknown>(url: string): DocBacked<T>
}

export function createRepo(): Repo {
  const repo = new AutomergeRepo({ network: [] })
  const known = new Map<string, DocBacked>()
  const found = new Map<string, Promise<DocBacked>>()
  const keep = <T>(handle: DocBacked<T>): DocBacked<T> => {
    known.set(handle.url, handle as DocBacked)
    found.set(handle.url, Promise.resolve(handle as DocBacked))
    return handle
  }

  return {
    create: <T>(init: T) => keep(fromDoc(repo.create<T>(init))),
    import: <T>(binary: Uint8Array) => keep(fromDoc(repo.import<T>(binary))),
    find<T>(url: string) {
      let handle = found.get(url)
      if (!handle) {
        handle = repo.find(url as AutomergeUrl).then((doc) => keep(fromDoc(doc) as DocBacked))
        handle.catch(() => found.delete(url))
        found.set(url, handle)
      }
      return handle as Promise<DocBacked<T>>
    },
    clone<T>(url: string) {
      const source = known.get(url)
      if (!source) throw new Error(`${url} isn't one of this repo's documents`)
      return keep(fromDoc(repo.clone(source.doc))) as DocBacked<T>
    },
  }
}
