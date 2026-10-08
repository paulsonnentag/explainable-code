// Forks a document: a new draft, listed under the document's main draft. It
// holds no clones yet; they are made when the draft is checked out. Named by
// the `name` slot, or "Draft <n>" from the main draft's counter. Waits for the
// main draft if the document has none yet.

import type { Env, Repo } from "../../../core"
import type { DraftDoc } from "../types"

export default function fork(env: Env) {
  const mainDraftUrl = env.get<string>("data/@patchwork/mainDraftUrl").value
  if (mainDraftUrl === undefined) return
  const repo = env.get<Repo>("repo").value
  if (!repo) return
  const name = env.get<string>("name").value

  let cancelled = false
  repo
    .find<DraftDoc>(mainDraftUrl)
    .then((main) => {
      if (cancelled) return
      const number = (main.value.draftCounter ?? 0) + 1
      const draft = repo.create<DraftDoc>({
        "@patchwork": { type: "draft" },
        name: name ?? `Draft ${number}`,
        parent: main.url,
        drafts: [],
        clones: {},
      })
      main.change((d) => {
        d.drafts.push(draft.url)
        d.draftCounter = number
      })
    })
    .catch((error) => console.error("[drafts/fork]", error))
  return () => {
    cancelled = true
  }
}
