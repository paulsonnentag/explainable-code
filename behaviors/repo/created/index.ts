// Shadows `repo` with the one above, plus `createdDocuments`: every document
// created through it, in order.

import type { DocBacked, Env, Repo } from "../../../core"

export default function created(env: Env) {
  const base = env.parent?.get<Repo>("repo").value // read above, so this scope's `repo` is not what is read
  if (!base) return
  const repo = env.put("repo", {
    find: <T>(url: string) => base.find<T>(url),
    create<T>(init: T) {
      const doc = base.create(init)
      repo.change((r) => {
        r.createdDocuments.push(doc)
      })
      return doc
    },
    createdDocuments: [] as DocBacked[],
  })
}
