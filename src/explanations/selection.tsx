import { For } from "solid-js"
import { render } from "solid-js/web"
import { behavior, type Env } from "@/core"

type Point = { x: number; y: number }
type Shape = { x?: number; y?: number; outline?: readonly Point[] }
type Trace = { id: string; points: Point[]; selected: boolean }

/** Explains `selection`: every shape's outline on the canvas, with the ones in `selection` highlighted. */
export const explainSelection = behavior("explain-selection", (env) => {
  if (env.get<string>("data/behavior/name").get() !== "selection") return
  const explained = env.get<Env>("data").get()
  const dom = env.get<HTMLElement>("dom").get()
  if (!explained || !dom) return
  const selection = explained.get<Record<string, boolean>>("selection").get() ?? {}
  const shapes = explained.get<Record<string, Shape>>("shapes").get() ?? {}
  const traces = Object.entries(shapes).map(([id, shape]) => ({
    id,
    points: (shape.outline ?? []).map((p) => ({ x: p.x + (shape.x ?? 0), y: p.y + (shape.y ?? 0) })),
    selected: !!selection[id],
  }))
  return render(() => <Figure traces={traces} />, dom)
})

function Figure(props: { traces: Trace[] }) {
  const box = bounds(props.traces.flatMap((trace) => trace.points))
  const selected = props.traces.filter((trace) => trace.selected).length
  return (
    <figure>
      <svg class="figure" viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}>
        <For each={props.traces}>
          {(trace) => <path class={trace.selected ? "outline selected" : "outline faint"} d={pathOf(trace.points)} />}
        </For>
      </svg>
      <figcaption>
        {selected} of {props.traces.length} shapes in <code>selection</code>, traced by their outlines
      </figcaption>
    </figure>
  )
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
  const pad = Math.max(width, height) * 0.05 + 4
  return { x: x - pad, y: y - pad, width: width + 2 * pad, height: height + 2 * pad }
}
