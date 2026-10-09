import { behavior } from "@/core"

/** Applies where `data/type` is "stroke": puts its points, an open outline, at `shapes/<id>/outline`. */
export const strokeOutline = behavior("stroke-outline", (env) => {
  if (env.get<string>("data/type").get() !== "stroke") return
  const id = env.get<string>("data/id").get()
  const points = env.get<readonly { x: number; y: number }[]>("data/points").get()
  if (!id || !points) return
  env.put(`shapes/${id}/outline`, points)
})
