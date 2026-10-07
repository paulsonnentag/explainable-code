// A behavior's run on a document, as `Run` records it: what it read, and what
// it wrote. Writes to the document it ran on are drawn at `data/…`, the key the
// behavior sees it at; created documents and writes into them by name.

import type { BehaviorRun, Env } from "../../core"
import { figure } from "../figure"

const MONO = "ui-monospace,'SF Mono',Menlo,monospace"

export default function behavior(env: Env): Node {
  const run = env.get<BehaviorRun>("data").value
  if (!isRun(run)) return figure(env, "behavior", line([text("Not a behavior run", "var(--faint, #a8a29e)")]))

  const body = document.createElement("div")
  body.style.cssText = "display:grid;grid-template-columns:max-content 1fr;gap:14px 28px;padding:16px 18px;font-size:13.5px"
  body.append(label("read"), lines(run.reads.map((key) => line([text(key)]))))
  const writes = [
    ...run.puts.map((put) => added([text(put.key), text(": "), value(put.value)])),
    ...run.writes
      .filter((write) => write.document === run.document)
      .map((write) => added([text(["data", ...write.path].join("/")), text(": "), value(write.value)])),
    ...run.creates.map((url) => added([name(url)])),
    ...run.writes
      .filter((write) => write.document !== run.document)
      .map((write) => added([name(write.document), text(`/${write.path.join("/")}: `), value(write.value)])),
  ]
  body.append(label("write"), lines(writes.length ? writes : [line([text("nothing", "var(--faint, #a8a29e)")])]))
  if (run.error) body.append(label("failed"), lines([line([text(run.error, "#b91c1c")])]))
  return figure(env, "behavior", body)
}

function isRun(value: unknown): value is BehaviorRun {
  const run = value as BehaviorRun | undefined
  return typeof run?.behavior === "string" && Array.isArray(run.reads) && Array.isArray(run.writes)
}

function label(name: string): HTMLElement {
  const element = text(name, "var(--muted, #78716c)")
  element.style.fontWeight = "550"
  return element
}

function lines(children: HTMLElement[]): HTMLElement {
  const element = document.createElement("div")
  element.style.cssText = "display:flex;flex-direction:column;gap:6px;min-width:0"
  element.append(...children)
  return element
}

function line(children: Node[]): HTMLElement {
  const element = document.createElement("div")
  element.style.cssText = `display:flex;align-items:baseline;flex-wrap:wrap;gap:0 2px;font:12.5px/1.6 ${MONO}`
  element.append(...children)
  return element
}

function added(children: Node[]): HTMLElement {
  const plus = text("+ ", "#15803d")
  plus.style.fontWeight = "700"
  return line([plus, ...children])
}

function text(content: string, color?: string): HTMLElement {
  const element = document.createElement("span")
  if (color) element.style.color = color
  element.textContent = content
  return element
}

/** A document by its declared name. */
function name(url: string): HTMLElement {
  const element = document.createElement("explanation-name")
  element.setAttribute("url", url)
  return element
}

/** A written value, short: urls by name, strings quoted, lists and objects counted. */
function value(written: unknown): Node {
  if (typeof written === "string" && written.startsWith("automerge:")) return name(written)
  if (typeof written === "string") return text(JSON.stringify(written.length > 40 ? `${written.slice(0, 40)}…` : written), "#15803d")
  if (Array.isArray(written)) return text(`[${written.length} ${written.length === 1 ? "item" : "items"}]`, "var(--faint, #a8a29e)")
  if (typeof written === "object" && written !== null) {
    const keys = Object.keys(written).length
    return text(`{${keys} ${keys === 1 ? "key" : "keys"}}`, "var(--faint, #a8a29e)")
  }
  return text(String(written), "#c2410c")
}
