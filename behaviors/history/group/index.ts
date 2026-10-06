// Groups a document's changes by time into a grouped history: a document of
// its own, linked from the original at `@patchwork/groupedHistory`. A new group
// starts wherever two neighbouring changes are more than ten minutes apart, and
// counts what its changes added and deleted. Changes that only touch
// `@patchwork` belong to no group.

import * as A from "@automerge/automerge"
import type { DocBacked, Env, Repo } from "../../../core"

type Linked = { "@patchwork": { type: string; groupedHistory?: string } }

type GroupedHistory = { "@patchwork": { type: "grouped-history" }; groups: Group[] }

/** Keys in alphabetical order, the order Automerge reads a map back in, so an unchanged group compares equal. */
type Group = {
  /** Every value written, character inserted or mark set. */
  additions: number
  /** Every value or character deleted. */
  deletions: number
  /** Seconds: the time of the newest change. */
  end: number
  /** The heads after the newest change. */
  heads: string[]
  /** Seconds: the time of the oldest change. */
  start: number
}

type Change = { hash: string; time: number; additions: number; deletions: number }

const GAP = 10 * 60 // seconds

export default function group(env: Env) {
  const type = env.get("data/@patchwork/type").value
  if (type === undefined || type === "grouped-history") return
  const repo = env.get<Repo>("repo").value
  if (!repo) return
  const linked = env.get<string>("data/@patchwork/groupedHistory").value
  const data = env.get<A.Doc<Linked>>("data")

  let cancelled = false
  const stops: (() => void)[] = []
  const start = (target: DocBacked<GroupedHistory>) => {
    stops.push(
      data.subscribe((doc) => {
        const next = groupByPause(changesOf(doc), GAP)
        if (JSON.stringify(target.value.groups) === JSON.stringify(next)) return
        target.change((d) => {
          d.groups = next
        })
      }),
    )
  }

  if (typeof linked === "string") {
    repo
      .find<GroupedHistory>(linked)
      .then((target) => {
        if (!cancelled) start(target)
      })
      .catch((error) => console.error("[history/group]", error))
  } else {
    const target = repo.create<GroupedHistory>({ "@patchwork": { type: "grouped-history" }, groups: [] })
    data.change((doc) => {
      doc["@patchwork"].groupedHistory = target.url
    })
    start(target)
  }

  return () => {
    cancelled = true
    for (const stop of stops) stop()
  }
}

/** Groups, newest first, from changes newest first. */
function groupByPause(newestFirst: Change[], gap: number): Group[] {
  const runs: Change[][] = []
  for (const change of newestFirst) {
    const run = runs[runs.length - 1]
    const newer = run?.[run.length - 1]
    if (newer && newer.time - change.time <= gap) run.push(change)
    else runs.push([change])
  }
  return runs.map((run) => ({
    additions: run.reduce((sum, change) => sum + change.additions, 0),
    deletions: run.reduce((sum, change) => sum + change.deletions, 0),
    end: run[0].time,
    heads: [run[0].hash],
    start: run[run.length - 1].time,
  }))
}

/** Every change that touches more than `@patchwork`, newest first. Changes with the same time keep their causal order. */
function changesOf(doc: A.Doc<Linked>): Change[] {
  const skip = new Set<string>()
  objectIdsUnder(doc["@patchwork"], skip)
  return A.getChangesSince(doc, [])
    .map((bytes, seq) => ({ change: A.decodeChange(bytes), seq }))
    .map(({ change, seq }) => ({ hash: change.hash!, time: change.time, seq, ...countOps(change, skip) }))
    .filter((change) => change.touched)
    .sort((a, b) => b.time - a.time || b.seq - a.seq)
}

/**
 * What `change` did outside `@patchwork`: every insert, set, make or mark is one
 * addition, every delete one deletion. Objects it makes under `@patchwork` join `skip`.
 */
function countOps(change: A.DecodedChange, skip: Set<string>): { additions: number; deletions: number; touched: boolean } {
  let additions = 0
  let deletions = 0
  let touched = false
  change.ops.forEach((op, i) => {
    const under = skip.has(op.obj) || (op.obj === "_root" && op.key === "@patchwork")
    if (op.action.startsWith("make") && under) skip.add(`${change.startOp + i}@${change.actor}`)
    if (under) return
    touched = true
    if (op.action === "markEnd") return
    if (op.action === "del") deletions += 1
    else additions += 1
  })
  return { additions, deletions, touched }
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
