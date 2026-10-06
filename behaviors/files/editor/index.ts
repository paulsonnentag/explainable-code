// A plain text editor for essays: a textarea over `data/content`.

import { updateText } from "@automerge/automerge-repo"
import type { Env } from "../../../core"

type Essay = { content?: string }

export default function editor(env: Env) {
  if (env.get("data/@patchwork/type").value !== "essay") return
  const data = env.get<Essay>("data")

  const dom = document.createElement("textarea")
  dom.style.cssText =
    "box-sizing:border-box;width:100%;height:100%;border:0;padding:10px;resize:none;outline:none;font:14px/1.5 system-ui"
  dom.addEventListener("input", () => data.change((doc) => updateText(doc, ["content"], dom.value)))
  const stop = data.subscribe((doc) => {
    const content = doc.content ?? ""
    if (dom.value !== content) dom.value = content
  })
  env.put("dom", dom)
  return stop
}
