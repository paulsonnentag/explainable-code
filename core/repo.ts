// The repo as the environment carries it: create and find, over handles.

import * as A from "@automerge/automerge"
import { parseAutomergeUrl, Repo as AutomergeRepo, type AutomergeUrl } from "@automerge/automerge-repo"
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket"
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb"
import { fromDoc, type DocBacked } from "./handle"

export type Repo = {
  create<T>(init: T): DocBacked<T>
  find<T = unknown>(url: string): Promise<DocBacked<T>>
}

export function createRepo(options: { syncServer: string; storage: string }): Repo {
  return wrap(
    new AutomergeRepo({
      network: [new WebSocketClientAdapter(options.syncServer)],
      storage: new IndexedDBStorageAdapter(options.storage),
    }),
  )
}

/** A repo that syncs with nothing and stores nothing, for one world of an example. */
export function createMemoryRepo(): Repo & {
  /** Imports `doc` with its whole history, under the same url. */
  copy<T>(doc: DocBacked<T>): DocBacked<T>
} {
  const repo = new AutomergeRepo({ network: [] })
  return {
    ...wrap(repo),
    copy<T>(doc: DocBacked<T>) {
      const { documentId } = parseAutomergeUrl(doc.url as AutomergeUrl)
      return fromDoc(repo.import<T>(A.save(doc.doc.doc() as A.Doc<T>), { docId: documentId }))
    },
  }
}

function wrap(repo: AutomergeRepo): Repo {
  return {
    create<T>(init: T) {
      return fromDoc(repo.create<T>(init))
    },
    async find<T>(url: string) {
      return fromDoc(await repo.find<T>(url as AutomergeUrl))
    },
  }
}
