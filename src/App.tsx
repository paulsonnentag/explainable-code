import { createSignal, For, onCleanup, Show } from "solid-js"
import { Explanation, type Runtime } from "../core"
import { explanations } from "./hosted"

const names = Object.keys(explanations).sort()

export function App(props: { runtime: Runtime }) {
  const current = () => location.hash.slice(1) || (names[0] ?? "")
  const [selected, setSelected] = createSignal(current())
  const onHash = () => setSelected(current())
  window.addEventListener("hashchange", onHash)
  onCleanup(() => window.removeEventListener("hashchange", onHash))

  return (
    <div class="app">
      <nav class="nav">
        <div class="brand">Explorable code</div>
        <For each={names}>
          {(name) => (
            <a href={`#${name}`} classList={{ active: name === selected() }}>
              {name}
            </a>
          )}
        </For>
      </nav>
      <main class="main">
        <Show
          when={explanations[selected()]}
          keyed
          fallback={<div class="error">No explanation for “{selected()}”.</div>}
        >
          {(text) => <Explanation name={selected()} markdown={text} runtime={props.runtime} />}
        </Show>
      </main>
    </div>
  )
}
