import { behavior } from "@/core"

/** Applies where `data/type` is "embed": puts the frame's rectangle at `shapes/<id>/outline`. */
export const embedOutline = behavior("embed-outline", (env) => {
  if (env.get<string>("data/type").get() !== "embed") return
  const id = env.get<string>("data/id").get()
  const width = env.get<number>("data/width").get() ?? 0
  const height = env.get<number>("data/height").get() ?? 0
  if (!id) return
  env.put(`shapes/${id}/outline`, [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
    { x: 0, y: 0 },
  ])
})
