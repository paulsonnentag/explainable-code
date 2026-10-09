import { For } from "solid-js"
import { render } from "solid-js/web"
import { behavior, type Env } from "@/core"

type Point = { x: number; y: number }

const OUTLINES = ["stroke-outline", "tool-outline", "embed-outline"]

/** Explains the outline behaviors: draws the outline they put at `shapes/<id>/outline`, its vertices, and whether it is closed. */
export const explainOutline = behavior("explain-outline", (env) => {
  if (!OUTLINES.includes(env.get<string>("data/behavior/name").get() ?? "")) return
  const explained = env.get<Env>("data").get()
  const dom = env.get<HTMLElement>("dom").get()
  if (!explained || !dom) return
  const id = explained.get<string>("data/id").get()
  const outline = (id && explained.get<readonly Point[]>(`shapes/${id}/outline`).get()) || []
  return render(() => <Figure outline={outline} id={id ?? ""} />, dom)
})

function Figure(props: { outline: readonly Point[]; id: string }) {
  const box = bounds(props.outline)
  const dot = Math.max(box.width, box.height) / 90
  const closed = isClosed(props.outline)
  return (
    <figure>
      <svg class="figure" viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}>
        <path class={closed ? "outline closed" : "outline"} d={pathOf(props.outline)} />
        <For each={[...props.outline]}>{(p) => <circle class="point" cx={p.x} cy={p.y} r={dot} />}</For>
      </svg>
      <figcaption>
        {closed ? "Closed" : "Open"}, {props.outline.length} points at <code>shapes/{props.id.slice(0, 4)}…/outline</code>
        {closed ? ", the last one the same as the first" : ""}
      </figcaption>
    </figure>
  )
}

function isClosed(outline: readonly Point[]): boolean {
  if (outline.length < 4) return false
  const first = outline[0]
  const last = outline[outline.length - 1]
  return first.x === last.x && first.y === last.y
}

function pathOf(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")
}

/** The points' bounding box with some room around it. */
function bounds(points: readonly Point[]): { x: number; y: number; width: number; height: number } {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(0, ...xs)
  const y = Math.min(0, ...ys)
  const width = Math.max(1, ...xs) - x
  const height = Math.max(1, ...ys) - y
  const pad = Math.max(width, height) * 0.1 + 4
  return { x: x - pad, y: y - pad, width: width + 2 * pad, height: height + 2 * pad }
}
