// The repo as the environment carries it: create, find and import, over handles.

import { Repo as AutomergeRepo, type AutomergeUrl } from "@automerge/automerge-repo"
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket"
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb"
import { fromDoc, type DocBacked } from "./handle"

export type Repo = {
  create<T>(init: T): DocBacked<T>
  /** The same promise for the same url, so a formula that finds again gets what it had. */
  find<T = unknown>(url: string): Promise<DocBacked<T>>
  /** A document from a saved binary, history included. */
  import<T>(binary: Uint8Array): DocBacked<T>
}

export function createRepo(options: { syncServer: string; storage: string }): Repo {
  const repo = new AutomergeRepo({
    network: [new WebSocketClientAdapter(options.syncServer)],
    storage: new IndexedDBStorageAdapter(options.storage),
  })
  const found = new Map<string, Promise<DocBacked>>()
  const known = <T>(handle: DocBacked<T>): DocBacked<T> => {
    found.set(handle.url, Promise.resolve(handle as DocBacked))
    return handle
  }

  return {
    create: <T>(init: T) => known(fromDoc(repo.create<T>(init))),
    import: <T>(binary: Uint8Array) => known(fromDoc(repo.import<T>(binary))),
    find<T>(url: string) {
      let handle = found.get(url)
      if (!handle) {
        handle = repo.find(url as AutomergeUrl).then((doc) => fromDoc(doc) as DocBacked)
        handle.catch(() => found.delete(url))
        found.set(url, handle)
      }
      return handle as Promise<DocBacked<T>>
    },
  }
}
