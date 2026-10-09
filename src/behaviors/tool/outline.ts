import { behavior } from "@/core"

/** Applies to shapes with a `label` (the tools): puts the button's rectangle at `shapes/<id>/outline`. */
export const toolOutline = behavior("tool-outline", (env) => {
  if (!env.get<string>("data/label").get()) return
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
