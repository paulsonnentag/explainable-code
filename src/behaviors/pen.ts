import { behavior } from "@/core"

type Point = { x: number; y: number }
type Pointer = Point & { down: boolean; over: { shape: string } | null }

/**
 * Applies where `data/type` is "pen". While this shape is the active `tool`, a press that doesn't
 * start on a locked shape draws a stroke: set at `shapes/<uuid>`, then its points as the pointer moves.
 */
export const pen = behavior("pen", (env) => {
  if (env.get<string>("data/type").get() !== "pen") return
  const id = env.get<string>("data/id").get()
  const tool = env.get<string | null>("tool")
  const shapes = env.get<Record<string, { locked?: boolean }>>("shapes")

  let stroke: { id: string; origin: Point; points: Point[] } | undefined
  let down = true // a press already underway when this runs isn't ours
  return env.get<Pointer>("pointer").subscribe((pointer) => {
    const pressed = !!pointer?.down && !down
    down = !!pointer?.down
    if (!pointer?.down) {
      stroke = undefined
      return
    }
    if (pressed) {
      const over = pointer.over && shapes.get()?.[pointer.over.shape]
      if (tool.get() !== id || over?.locked) return
      stroke = { id: crypto.randomUUID(), origin: { x: pointer.x, y: pointer.y }, points: [{ x: 0, y: 0 }] }
      env.get(`shapes/${stroke.id}`).set({ id: stroke.id, type: "stroke", ...stroke.origin, points: stroke.points })
      return
    }
    if (!stroke) return
    stroke.points = [...stroke.points, { x: pointer.x - stroke.origin.x, y: pointer.y - stroke.origin.y }]
    env.get(`shapes/${stroke.id}/points`).set(stroke.points)
  })
})
