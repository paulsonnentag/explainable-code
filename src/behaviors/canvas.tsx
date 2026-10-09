import { createEffect, For, from, onCleanup } from "solid-js"
import { render } from "solid-js/web"
import { behavior, type Env } from "@/core"

type Point = { x: number; y: number }
/** A shape is anything with an id and a type; the behaviors in its view decide how it looks. */
type Shape = { id: string; type: string; x?: number; y?: number; locked?: boolean; outline?: readonly Point[] }
type Pointer = Point & { down: boolean; over: { shape: string; env: string } | null }

const LOCKED = 1000 // added to a locked shape's z-index, so the tools stay on top
const SLACK = 6 // px around an open outline that still counts as over it

/**
 * Applies where `data/type` is "canvas". Puts `dom`, `pointer` and `tool` (null: no tool active).
 * Shows every shape under `shapes` in a view of its own: a fork with the shape at `data` and a
 * positioned element at `dom`. `pointer.over` is the topmost shape whose outline is under the
 * pointer, locked shapes first, and the view showing it.
 */
export const canvas = behavior("canvas", (env) => {
  if (env.get<string>("data/type").get() !== "canvas") return
  env.put("pointer", { x: 0, y: 0, down: false, over: null })
  env.put("tool", null)
  const pointer = env.get<Pointer>("pointer")
  const shapes = env.get<Record<string, Shape>>("shapes")
  const views = new Map<string, Env>()

  // A component's return value isn't always an element (in dev, Solid's hot reload makes it a
  // function), so the behavior makes the element it puts and renders into it.
  const dom = document.createElement("div")
  dom.className = "canvas"
  const move = (event: PointerEvent, down: boolean) => {
    const box = dom.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top
    const id = topmost(shapes.get() ?? {}, x, y)
    const view = id === undefined ? undefined : views.get(id)
    pointer.set({ x, y, down, over: id !== undefined && view ? { shape: id, env: view.id } : null })
  }
  dom.addEventListener("pointerdown", (event) => {
    dom.setPointerCapture(event.pointerId)
    move(event, true)
  })
  dom.addEventListener("pointermove", (event) => move(event, pointer.get()?.down ?? false))
  dom.addEventListener("pointerup", (event) => move(event, false))
  env.put("dom", dom)
  return render(() => <Shapes env={env} views={views} />, dom)
})

function Shapes(props: { env: Env; views: Map<string, Env> }) {
  const shapes = from(props.env.get<Record<string, Shape>>("shapes"))
  return (
    <div class="shapes">
      <For each={Object.keys(shapes() ?? {})}>
        {(id) => <View env={props.env} views={props.views} id={id} shape={() => shapes()?.[id]} />}
      </For>
    </div>
  )
}

function View(props: { env: Env; views: Map<string, Env>; id: string; shape: () => Shape | undefined }) {
  const view = props.env.fork(props.id)
  props.views.set(props.id, view)
  onCleanup(() => {
    props.views.delete(props.id)
    view.destroy()
  })
  createEffect(() => view.put("data", props.shape()))
  const style = () => {
    const shape = props.shape()
    return { transform: `translate(${shape?.x ?? 0}px, ${shape?.y ?? 0}px)`, "z-index": shape?.locked ? LOCKED : 0 }
  }
  return <div class="view" style={style()} ref={(element) => view.put("dom", element)} />
}

/** The id of the topmost shape whose outline is under the point: locked shapes over the rest, later shapes over earlier ones. */
function topmost(shapes: Record<string, Shape>, x: number, y: number): string | undefined {
  let best: string | undefined
  for (const [id, shape] of Object.entries(shapes)) {
    if (!hits(shape, x, y)) continue
    if (best === undefined || shape.locked || !shapes[best].locked) best = id
  }
  return best
}

/** Whether the canvas point is over the shape: inside a closed outline, or within `SLACK` of an open one. */
function hits(shape: Shape, x: number, y: number): boolean {
  const outline = shape.outline
  if (!outline?.length) return false
  const px = x - (shape.x ?? 0)
  const py = y - (shape.y ?? 0)
  if (isClosed(outline)) return inside(outline, px, py)
  if (outline.length === 1) return Math.hypot(px - outline[0].x, py - outline[0].y) <= SLACK
  for (let i = 1; i < outline.length; i++) {
    if (distanceToSegment(px, py, outline[i - 1], outline[i]) <= SLACK) return true
  }
  return false
}

function isClosed(outline: readonly Point[]): boolean {
  if (outline.length < 4) return false
  const first = outline[0]
  const last = outline[outline.length - 1]
  return first.x === last.x && first.y === last.y
}

function inside(polygon: readonly Point[], x: number, y: number): boolean {
  let odd = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) odd = !odd
  }
  return odd
}

function distanceToSegment(x: number, y: number, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length))
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy))
}
