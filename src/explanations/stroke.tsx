import { For } from "solid-js"
import { render } from "solid-js/web"
import { behavior, type Env } from "@/core"

type Point = { x: number; y: number }

/** Explains `stroke`: draws the line through `data/points`, scaled to fit, with a dot on every point. */
export const explainStroke = behavior("explain-stroke", (env) => {
  if (env.get<string>("data/behavior/name").get() !== "stroke") return
  const explained = env.get<Env>("data").get()
  const dom = env.get<HTMLElement>("dom").get()
  if (!explained || !dom) return
  const points = explained.get<readonly Point[]>("data/points").get() ?? []
  return render(() => <Figure points={points} />, dom)
})

function Figure(props: { points: readonly Point[] }) {
  const box = bounds(props.points)
  const dot = Math.max(box.width, box.height) / 90
  return (
    <figure>
      <svg class="figure" viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}>
        <polyline class="ink" points={props.points.map((p) => `${p.x},${p.y}`).join(" ")} />
        <For each={[...props.points]}>{(p) => <circle class="point" cx={p.x} cy={p.y} r={dot} />}</For>
      </svg>
      <figcaption>
        {props.points.length} points in <code>data/points</code>, relative to the shape's position
      </figcaption>
    </figure>
  )
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
