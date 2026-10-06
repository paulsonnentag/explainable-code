// A world: a root scope with a repo of its own, and one scope per document
// that shows it, the way a view does (`data`, and a null `dom`). The world's
// repo starts with a copy of each document, so nothing a behavior writes
// reaches the real one or another world. Behaviors are attached to every
// document scope; each decides for itself whether it applies there, and
// writes to the copies as itself.

import { createEnvironment, type Env } from "./environment"
import { attributed, recording, type Recorded } from "./recording"
import { createMemoryRepo } from "./repo"
import type { Runtime } from "./runtime"

export type World = {
  /** Document url → the scope showing it. */
  scopes: Map<string, Env>
  /** Document url → this world's copy, with the writes made to it. */
  docs: Map<string, Recorded>
  /** Attaches exactly these behaviors, in this order, to every document scope. */
  setBehaviors(urls: string[]): Promise<void>
  destroy(): void
}

export async function createWorld(id: string, runtime: Runtime, docs: string[]): Promise<World> {
  const repo = createMemoryRepo()
  const root = createEnvironment(id)
  root.put("repo", repo)
  const scopes = new Map<string, Env>()
  const copies = new Map<string, Recorded>()
  for (const url of docs) {
    const data = recording(repo.copy(await runtime.repo.find(url)))
    const scope = root.fork(url)
    scope.put("data", data)
    scope.put("dom", null)
    scopes.set(url, scope)
    copies.set(url, data)
  }

  let generation = 0
  return {
    scopes,
    docs: copies,
    async setBehaviors(urls) {
      const current = ++generation
      const runs = await Promise.all(urls.map(runtime.load))
      if (current !== generation) return
      for (const scope of scopes.values()) {
        for (const { url } of scope.behaviors) if (!urls.includes(url)) scope.detach(url)
        urls.forEach((url, i) => {
          if (!scope.behaviors.some((b) => b.url === url)) scope.attach(attributed(runs[i], url), url)
        })
      }
    },
    destroy: () => root.destroy(),
  }
}
