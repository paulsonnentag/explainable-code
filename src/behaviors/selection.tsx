import { For, from, type Accessor } from "solid-js"
import { render } from "solid-js/web"
import { behavior, type Env } from "@/core"

type Point = { x: number; y: number }
type Shape = { x?: number; y?: number; outline?: readonly Point[] }

/** Applies where `data/type` is "canvas": traces the outline of every shape in `selection` over the canvas at `dom`. */
export const selection = behavior("selection", (env) => {
  if (env.get<string>("data/type").get() !== "canvas") return
  const dom = env.get<HTMLElement>("dom").get()
  if (!dom) return
  const layer = document.createElement("div")
  dom.append(layer)
  const dispose = render(() => <Overlay env={env} />, layer)
  return () => {
    dispose()
    layer.remove()
  }
})

function Overlay(props: { env: Env }) {
  const selected = from(props.env.get<Record<string, boolean>>("selection"))
  const shapes = from(props.env.get<Record<string, Shape>>("shapes"))
  const ids = () => Object.entries(selected() ?? {}).flatMap(([id, on]) => (on ? [id] : []))
  return (
    <svg class="overlay">
      <For each={ids()}>{(id) => <Trace shape={() => shapes()?.[id]} />}</For>
    </svg>
  )
}

function Trace(props: { shape: Accessor<Shape | undefined> }) {
  return (
    <path
      class="selection"
      transform={`translate(${props.shape()?.x ?? 0} ${props.shape()?.y ?? 0})`}
      d={pathOf(props.shape()?.outline ?? [])}
    />
  )
}

function pathOf(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")
}
