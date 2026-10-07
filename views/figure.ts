// A view's content in a frame, captioned with the name of what it shows, when
// it has one, and what it is shown as: "recipe as markdown". Shared by the
// views here; any view may caption itself differently, or not at all.

import type { Env } from "../core"

export function figure(env: Env, shownAs: string, content: Node): HTMLElement {
  const name = env.get<string>("name").value
  const element = document.createElement("figure")
  element.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0;margin:0"
  if (name !== undefined) element.dataset.name = name

  const frame = document.createElement("div")
  frame.style.cssText =
    "flex:1;min-height:0;overflow:auto;border:1px solid var(--frame-border, var(--line, #e7e5e4));background:var(--card, #fff);box-shadow:var(--frame-ring, 0 0 0 0 transparent), 0 1px 2px rgb(28 25 23 / 0.04), 0 10px 28px -16px rgb(28 25 23 / 0.16);transition:border-color .15s, box-shadow .15s"
  frame.append(content)

  const caption = document.createElement("figcaption")
  caption.style.cssText =
    "display:flex;align-items:baseline;gap:6px;margin-top:10px;padding:0 2px;font-size:12.5px;color:var(--muted, #78716c)"
  if (name !== undefined) {
    const chip = document.createElement("explanation-name")
    chip.setAttribute("name", name)
    caption.append(chip)
  }
  const as = document.createElement("span")
  as.style.color = "var(--faint, #a8a29e)"
  as.textContent = `as ${shownAs}`
  caption.append(as)

  element.append(frame, caption)
  return element
}
