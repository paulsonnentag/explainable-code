import { behavior } from "@/core"

type Point = { x: number; y: number }
type Pointer = Point & { down: boolean; over: { shape: string } | null }
type Shape = { x?: number; y?: number; locked?: boolean }

/**
 * Applies where `data/type` is "select". Puts `selection` ({ [id]: true }) and becomes the active
 * `tool` whenever no tool is. While active, a press selects the shape under the pointer, or nothing
 * over the background, and dragging moves the shape by setting `shapes/<id>/x` and `shapes/<id>/y`.
 * Locked shapes aren't selectable.
 */
export const select = behavior("select", (env) => {
  if (env.get<string>("data/type").get() !== "select") return
  const id = env.get<string>("data/id").get()
  env.put("selection", {})
  const selection = env.get<Record<string, boolean>>("selection")
  const tool = env.get<string | null>("tool")
  const shapes = env.get<Record<string, Shape>>("shapes")

  const stopClaiming = tool.subscribe((active) => {
    if (active === null && id) tool.set(id)
  })
  let drag: { shape: string; from: Point; origin: Point } | undefined
  let down = true // a press already underway when this runs isn't ours
  const stopSelecting = env.get<Pointer>("pointer").subscribe((pointer) => {
    const pressed = !!pointer?.down && !down
    down = !!pointer?.down
    if (!pointer?.down) {
      drag = undefined
      return
    }
    if (pressed) {
      if (tool.get() !== id) return
      const over = pointer.over?.shape
      const shape = over === undefined ? undefined : shapes.get()?.[over]
      if (over === undefined) selection.set({})
      if (over === undefined || !shape || shape.locked) return
      selection.set({ [over]: true })
      drag = { shape: over, from: { x: pointer.x, y: pointer.y }, origin: { x: shape.x ?? 0, y: shape.y ?? 0 } }
      return
    }
    if (!drag) return
    env.get(`shapes/${drag.shape}/x`).set(drag.origin.x + pointer.x - drag.from.x)
    env.get(`shapes/${drag.shape}/y`).set(drag.origin.y + pointer.y - drag.from.y)
  })
  return () => {
    stopClaiming()
    stopSelecting()
  }
})
