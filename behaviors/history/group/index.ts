// Groups the document's changes into a document of their own, linked from it
// at `@patchwork/groups`: a new group starts wherever two neighbouring changes
// are more than ten minutes apart. Each group sums up its changes the way a
// timeline row shows them.

import * as A from "@automerge/automerge"
import type { DocBacked, Env, Repo } from "../../../core"

type Linked = { "@patchwork": { type: string; groups?: string } }

type GroupDoc = { "@patchwork": { type: "change-group" }; groups: Group[] }

type Group = {
  /** Authors, newest first. */
  actors: string[]
  additions: number
  changes: number
  deletions: number
  /** Seconds: the oldest and newest change's time. */
  from: number
  /** The newest change in the group. */
  newest: string
  to: number
}

type Change = { hash: string; time: number; actor: string; additions: number; deletions: number }

const GAP = 10 * 60 // seconds

export default function group(env: Env) {
  const type = env.get("data/@patchwork/type").value
  if (type === undefined || type === "change-group") return
  const repo = env.get<Repo>("repo").value
  if (!repo) return
  const linked = env.get<string>("data/@patchwork/groups").value
  const data = env.get<A.Doc<Linked>>("data")

  const dom = document.createElement("div")
  env.put("dom", dom)

  let cancelled = false
  const stops: (() => void)[] = []
  const start = (target: DocBacked<GroupDoc>) => {
    stops.push(
      data.subscribe((doc) => {
        const next = groupByPause(changesOf(doc), GAP)
        if (JSON.stringify(target.value.groups) === JSON.stringify(next)) return
        target.change((d) => {
          d.groups = next
        })
      }),
      target.subscribe((d) => dom.replaceChildren(...(d.groups ?? []).map(row))),
    )
  }

  if (typeof linked === "string") {
    repo
      .find<GroupDoc>(linked)
      .then((target) => {
        if (!cancelled) start(target)
      })
      .catch((error) => console.error("[history/group]", error))
  } else {
    const target = repo.create<GroupDoc>({ "@patchwork": { type: "change-group" }, groups: [] })
    data.change((doc) => {
      doc["@patchwork"].groups = target.url
    })
    start(target)
  }

  return () => {
    cancelled = true
    for (const stop of stops) stop()
  }
}

function groupByPause(newestFirst: Change[], gap: number): Group[] {
  const runs: Change[][] = []
  for (const change of newestFirst) {
    const run = runs[runs.length - 1]
    const newer = run?.[run.length - 1]
    if (newer && newer.time - change.time <= gap) run.push(change)
    else runs.push([change])
  }
  return runs.map(summarize)
}

/** Keys in alphabetical order, the order Automerge reads a map back in, so an unchanged group compares equal. */
function summarize(run: Change[]): Group {
  return {
    actors: [...new Set(run.map((c) => c.actor))],
    additions: run.reduce((sum, c) => sum + c.additions, 0),
    changes: run.length,
    deletions: run.reduce((sum, c) => sum + c.deletions, 0),
    from: run[run.length - 1].time,
    newest: run[0].hash,
    to: run[0].time,
  }
}

/** Every change, newest first. Changes with the same time keep their causal order. */
function changesOf(doc: A.Doc<Linked>): Change[] {
  const skip = new Set<string>()
  objectIdsUnder(doc["@patchwork"], skip)
  return A.getChangesSince(doc, [])
    .map((bytes, seq) => {
      const change = A.decodeChange(bytes)
      return { hash: change.hash!, time: change.time, actor: change.actor, ...countOps(change, skip), seq }
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

function row(group: Group): HTMLElement {
  const element = document.createElement("div")
  element.style.cssText =
    "display:flex;gap:8px;align-items:baseline;padding:6px 10px;border-bottom:1px solid #f4f4f5"
  element.append(
    span(formatSpan(group.from, group.to), "flex:1"),
    span(`${group.changes} ${group.changes === 1 ? "change" : "changes"}`, "color:#71717a;font-size:12px"),
    span(`+${group.additions}`, "color:#16a34a"),
    span(`−${group.deletions}`, "color:#dc2626"),
  )
  return element
}

function span(text: string, style: string): HTMLElement {
  const element = document.createElement("span")
  element.style.cssText = style
  element.textContent = text
  return element
}

function formatSpan(from: number, to: number): string {
  const start = new Date(from * 1000)
  const end = new Date(to * 1000)
  const date = start.toLocaleDateString(undefined, { dateStyle: "medium" })
  const time = (d: Date) => d.toLocaleTimeString(undefined, { timeStyle: "short" })
  return from === to ? `${date} ${time(start)}` : `${date} ${time(start)}–${time(end)}`
}
