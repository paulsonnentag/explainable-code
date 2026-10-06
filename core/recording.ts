// Who wrote what to a document. Behaviors attached through `attributed` write
// as themselves, and a `recording` document keeps the heads each write went
// from and to, so a write's diff stays the same however much the document
// changes afterwards.

import * as A from "@automerge/automerge"
import type { Env, Run } from "./environment"
import type { DocBacked, Handle } from "./handle"

/** One `change` on a recording document. `by` is undefined for writes made outside a behavior. */
export type Write = { by: string | undefined; from: A.Heads; to: A.Heads }

export type Recorded<T = unknown> = DocBacked<T> & { readonly writes: readonly Write[] }

/** The behavior writing right now, while it calls `change` on a handle it got from its env. */
let author: string | undefined

/** `run`, with every change made through a handle it gets from its env attributed to `url`. */
export function attributed(run: Run, url: string): Run {
  return (env) =>
    run(Object.create(env, { get: { value: <T>(key: string) => writingAs(env.get<T>(key), url) } }) as Env)
}

export function recording<T>(doc: DocBacked<T>): Recorded<T> {
  const writes: Write[] = []
  const heads = () => A.getHeads(doc.value as A.Doc<T>)
  return {
    doc: doc.doc,
    url: doc.url,
    writes,
    get value() {
      return doc.value
    },
    change(fn) {
      const from = heads()
      doc.change(fn)
      const to = heads()
      if (from.join() !== to.join()) writes.push({ by: author, from, to })
    },
    subscribe: (fn) => doc.subscribe(fn),
  }
}

function writingAs<T>(handle: Handle<T>, url: string): Handle<T> {
  return Object.create(handle, {
    change: {
      value(fn: (value: T) => T | void) {
        const outer = author
        author = url
        try {
          handle.change(fn)
        } finally {
          author = outer
        }
      },
    },
  }) as Handle<T>
}
