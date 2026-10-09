import { createEffect, from } from "solid-js"
import { render } from "solid-js/web"
import { behavior, type Env } from "@/core"

type Embed = { width: number; height: number; content: { type: string } }

/**
 * Applies where `data/type` is "embed": draws a frame into `dom` and shows `data/content` in a view
 * of its own, a fork with the content at `data` and the frame's body at `dom`. The strip along the
 * top belongs to the canvas; the body takes its own input, but only while the select tool is active,
 * so the other tools still work over an embed.
 */
export const embed = behavior("embed", (env) => {
  if (env.get<string>("data/type").get() !== "embed") return
  const dom = env.get<HTMLElement>("dom").get()
  const content = env.get<Embed["content"]>("data/content").get()
  if (!dom || !content) return

  const body = document.createElement("div")
  body.className = "embed-body"
  body.addEventListener("pointerdown", (event) => event.stopPropagation())
  const view = env.fork("content")
  view.put("data", content)
  view.put("dom", body)

  return render(() => <Frame env={env} body={body} />, dom)
})

function Frame(props: { env: Env; body: HTMLElement }) {
  const data = from(props.env.get<Embed>("data"))
  const tool = from(props.env.get<string | null>("tool"))
  const shapes = from(props.env.get<Record<string, { type: string }>>("shapes"))
  createEffect(() => {
    props.body.style.pointerEvents = shapes()?.[tool() ?? ""]?.type === "select" ? "auto" : "none"
  })
  return (
    <div class="embed" style={{ width: `${data()?.width ?? 0}px`, height: `${data()?.height ?? 0}px` }}>
      <div class="embed-strip">{data()?.content.type}</div>
      {props.body}
    </div>
  )
}
