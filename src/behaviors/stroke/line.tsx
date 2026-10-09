import { from } from "solid-js"
import { render } from "solid-js/web"
import { behavior, type Signal } from "@/core"

type Point = { x: number; y: number }

/** Applies where `data/type` is "stroke": draws a line through `data/points` into `dom`. */
export const strokeLine = behavior("stroke", (env) => {
  if (env.get<string>("data/type").get() !== "stroke") return
  const dom = env.get<HTMLElement>("dom").get()
  if (!dom) return
  const points = env.get<readonly Point[]>("data/points")
  return render(() => <Line points={points} />, dom)
})

function Line(props: { points: Signal<readonly Point[] | undefined> }) {
  const points = from(props.points)
  return (
    <svg class="stroke">
      <polyline points={(points() ?? []).map((p) => `${p.x},${p.y}`).join(" ")} />
    </svg>
  )
}
