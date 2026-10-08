// Gives a document its main draft: a draft document that lists the document's
// drafts. Created the first time, and linked from the document at
// `@patchwork/mainDraftUrl`. Drafts are never drafted in turn.

import type { Env, Repo } from "../../../core"
import type { Drafted, DraftDoc } from "../types"

export default function mainDraft(env: Env) {
  const type = env.get<string>("data/@patchwork/type").value
  if (type === undefined || type === "draft") return
  if (env.get<string>("data/@patchwork/mainDraftUrl").value !== undefined) return
  const repo = env.get<Repo>("repo").value
  if (!repo) return
  const data = env.get<Drafted>("data")
  const main = repo.create<DraftDoc>({
    "@patchwork": { type: "draft" },
    isMain: true,
    parent: data.url!,
    drafts: [],
    clones: {},
    draftCounter: 0,
  })
  data.change((doc) => {
    doc["@patchwork"].mainDraftUrl = main.url
  })
}
