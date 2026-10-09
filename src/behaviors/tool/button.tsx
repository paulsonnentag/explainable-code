import { from } from "solid-js"
import { render } from "solid-js/web"
import { behavior, type Signal } from "@/core"

type Tool = { id: string; label: string; width: number; height: number }
type Pointer = { down: boolean; over: { shape: string } | null }

/** Applies to shapes with a `label` (the tools): draws a button into `dom`. Pressing it makes this shape the active `tool`. */
export const toolButton = behavior("tool-button", (env) => {
  if (!env.get<string>("data/label").get()) return
  const dom = env.get<HTMLElement>("dom").get()
  if (!dom) return
  const data = env.get<Tool>("data")
  const tool = env.get<string | null>("tool")

  let down = true // a press already underway when this runs isn't ours
  const stop = env.get<Pointer>("pointer").subscribe((pointer) => {
    const pressed = !!pointer?.down && !down
    down = !!pointer?.down
    const id = data.get()?.id
    if (pressed && id && pointer?.over?.shape === id) tool.set(id)
  })
  const dispose = render(() => <Button data={data} tool={tool} />, dom)
  return () => {
    stop()
    dispose()
  }
})

function Button(props: { data: Signal<Tool | undefined>; tool: Signal<string | null | undefined> }) {
  const data = from(props.data)
  const active = from(props.tool)
  return (
    <div
      class="tool"
      classList={{ active: active() === data()?.id }}
      style={{ width: `${data()?.width ?? 0}px`, height: `${data()?.height ?? 0}px` }}
    >
      {data()?.label}
    </div>
  )
}
