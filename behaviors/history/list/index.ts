// Shows the document's changes as a list, newest first: one row per change,
// with how much it added and deleted.

import * as A from "@automerge/automerge"
import type { Env } from "../../../core"

type Change = { hash: string; time: number; additions: number; deletions: number }

export default function list(env: Env) {
  if (env.get("data/@patchwork/type").value === undefined) return
  const data = env.get<A.Doc<Record<string, unknown>>>("data")

  const dom = document.createElement("div")
  const stop = data.subscribe((doc) => {
    dom.replaceChildren(...changesOf(doc).map(row))
  })
  env.put("dom", dom)
  return stop
}

/** Every change, newest first. Changes with the same time keep their causal order. */
function changesOf(doc: A.Doc<Record<string, unknown>>): Change[] {
  const skip = new Set<string>()
  objectIdsUnder(doc["@patchwork"], skip)
  return A.getChangesSince(doc, [])
    .map((bytes, seq) => {
      const change = A.decodeChange(bytes)
      return { hash: change.hash!, time: change.time, ...countOps(change, skip), seq }
    })
    .sort((a, b) => b.time - a.time || b.seq - a.seq)
}

/** Every insert, set, make or mark counts as one addition, every delete as one deletion. Ops under `@patchwork` don't count. */
function countOps(change: A.DecodedChange, skip: Set<string>): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  change.ops.forEach((op, i) => {
    const skipped = skip.has(op.obj) || (op.obj === "_root" && op.key === "@patchwork")
    if (op.action.startsWith("make") && skipped) skip.add(`${change.startOp + i}@${change.actor}`)
    if (skipped || op.action === "markEnd") return
    if (op.action === "del") deletions += 1
    else additions += 1
  })
  return { additions, deletions }
}

/** The object ids of a container and everything inside it, including the text objects behind strings in maps. */
function objectIdsUnder(value: unknown, out: Set<string>): void {
  if (!value || typeof value !== "object") return
  const id = A.getObjectId(value)
  if (id) out.add(id)
  if (Array.isArray(value)) {
    for (const item of value) objectIdsUnder(item, out)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") {
      const textId = A.getObjectId(value, key)
      if (typeof textId === "string") out.add(textId)
    } else objectIdsUnder(child, out)
  }
}

function row(change: Change): HTMLElement {
  const element = document.createElement("div")
  element.style.cssText =
    "display:flex;gap:8px;align-items:baseline;padding:6px 10px;border-bottom:1px solid #f4f4f5"
  element.append(
    span(change.hash.slice(0, 8), "font:12px ui-monospace,monospace"),
    span(formatTime(change.time), "flex:1"),
    span(`+${change.additions}`, "color:#16a34a"),
    span(`−${change.deletions}`, "color:#dc2626"),
  )
  return element
}

function span(text: string, style: string): HTMLElement {
  const element = document.createElement("span")
  element.style.cssText = style
  element.textContent = text
  return element
}

function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}
