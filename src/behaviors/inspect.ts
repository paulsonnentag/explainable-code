import { behavior, type Env } from "@/core"

type Pointer = { x: number; y: number; down: boolean; over: { shape: string; env: string } | null }

const WIDTH = 560
const HEIGHT = 440

/**
 * Applies where `data/type` is "inspect". While this shape is the active `tool`, a press that doesn't
 * start on a locked shape places an embed showing an inspector of the environment under the pointer
 * (the view of the shape there, or the root over the background), then sets `tool` back to null.
 */
export const inspect = behavior("inspect", (env) => {
  if (env.get<string>("data/type").get() !== "inspect") return
  const id = env.get<string>("data/id").get()
  const tool = env.get<string | null>("tool")
  const shapes = env.get<Record<string, { locked?: boolean }>>("shapes")

  let down = true // a press already underway when this runs isn't ours
  return env.get<Pointer>("pointer").subscribe((pointer) => {
    const pressed = !!pointer?.down && !down
    down = !!pointer?.down
    if (!pressed || !pointer || tool.get() !== id) return
    if (pointer.over && shapes.get()?.[pointer.over.shape]?.locked) return
    const embed = crypto.randomUUID()
    env.get(`shapes/${embed}`).set({
      id: embed,
      type: "embed",
      x: pointer.x,
      y: pointer.y,
      width: WIDTH,
      height: HEIGHT,
      content: { type: "inspector", target: pointer.over?.env ?? rootOf(env).id },
    })
    tool.set(null)
  })
})

function rootOf(env: Env): Env {
  let root = env
  while (root.parent) root = root.parent
  return root
}
