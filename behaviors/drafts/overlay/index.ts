// Checks a draft out: from here down, `data` is the draft's clone of the
// document instead of the document, so edits land in the draft. The clone is
// made the first time and recorded in the draft's `clones`, with the heads the
// document had then. The draft is the `draft` slot.

import * as Automerge from "@automerge/automerge"
import type { Env, Repo } from "../../../core"
import type { DraftDoc } from "../types"

export default function overlay(env: Env) {
  const draft = env.get<DraftDoc>("draft")
  const clones = draft.value?.clones
  if (!clones) return
  const repo = env.get<Repo>("repo").value
  if (!repo) return
  const original = env.get("data").url
  if (!original) return

  const known = clones[original]
  if (known) {
    let cancelled = false
    repo.find(known.cloneUrl).then((clone) => {
      if (!cancelled) env.put("data", clone)
    })
    return () => {
      cancelled = true
    }
  }

  const clone = repo.clone(original)
  draft.change((d) => {
    d.clones[original] = { cloneUrl: clone.url, clonedAt: Automerge.getHeads(clone.value as Automerge.Doc<unknown>) }
  })
  env.put("data", clone)
  return () => {}
}
