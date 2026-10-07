// A plain text editor for markdown documents: a textarea over `data/content`.

import { updateText } from "@automerge/automerge-repo"
import { onCleanup } from "solid-js"
import type { Env } from "../../core"
import { figure } from "../figure"

type Markdown = { "@patchwork"?: { type?: string }; content?: string }

export default function markdown(env: Env): Node {
  const data = env.get<Markdown>("data")
  if (data.value?.["@patchwork"]?.type !== "markdown") return figure(env, "markdown", message("Not a markdown document"))

  const textarea = document.createElement("textarea")
  textarea.style.cssText =
    "display:block;box-sizing:border-box;width:100%;height:100%;min-height:220px;border:0;padding:14px 16px;resize:none;outline:none;background:transparent;color:inherit;font:13.5px/1.6 ui-monospace,'SF Mono',Menlo,monospace"
  textarea.addEventListener("input", () => data.change((doc) => updateText(doc, ["content"], textarea.value)))
  onCleanup(
    data.subscribe((doc) => {
      const content = doc.content ?? ""
      if (textarea.value !== content) textarea.value = content
    }),
  )
  return figure(env, "markdown", textarea)
}

function message(text: string): HTMLElement {
  const element = document.createElement("div")
  element.style.cssText = "padding:10px 14px;color:#a8a29e;font-size:13.5px"
  element.textContent = text
  return element
}
