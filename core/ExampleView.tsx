import { createSignal, For, onCleanup, Show } from "solid-js"
import { diffScopes, watchScopes, type DiffRow } from "./diff"
import type { Env } from "./environment"
import { EnvironmentView } from "./EnvironmentView"
import type { Example } from "./example"
import { behaviorName } from "./loader"
import type { Recorded } from "./recording"
import type { Runtime } from "./runtime"
import { createWorld, type World } from "./world"

let examples = 0

/**
 * An example running in two worlds over the same documents: one with every
 * behavior, shown in the frames, and a baseline with only the dependencies.
 * The diff is what the tested behaviors wrote to the documents, and the first
 * world's bindings against the second's.
 */
export function ExampleView(props: { example: Example; runtime: Runtime }) {
  const { example, runtime } = props
  const id = `example-${++examples}`
  const docs = [...new Set(example.frames.map((frame) => frame.doc))]
  const [worlds, setWorlds] = createSignal<{ shown: World; baseline: World }>()
  const [error, setError] = createSignal<string>()
  const [showEnvironment, setShowEnvironment] = createSignal(false)

  let disposed = false
  Promise.all([createWorld(id, runtime, docs), createWorld(`${id}-baseline`, runtime, docs)])
    .then(async ([shown, baseline]) => {
      if (disposed) {
        shown.destroy()
        baseline.destroy()
        return
      }
      setWorlds({ shown, baseline })
      await Promise.all([
        shown.setBehaviors([...example.uses, ...example.tests]),
        baseline.setBehaviors(example.uses),
      ])
    })
    .catch((e) => setError(String(e?.message ?? e)))
  onCleanup(() => {
    disposed = true
    worlds()?.shown.destroy()
    worlds()?.baseline.destroy()
  })

  return (
    <div class="example">
      <Show when={error()}>
        <div class="error">{error()}</div>
      </Show>
      <Show when={worlds()} fallback={<Show when={!error()}>Loading documents…</Show>}>
        {(w) => (
          <>
            <div class="frames">
              <For each={example.frames}>
                {(frame) => <FrameView scope={w().shown.scopes.get(frame.doc)!} view={frame.view} />}
              </For>
            </div>
            <DiffView
              pairs={docs.map((url) => ({ shown: w().shown.scopes.get(url)!, baseline: w().baseline.scopes.get(url)! }))}
              docs={w().shown.docs}
              tests={new Set(example.tests)}
            />
            <div>
              <button class="environment-toggle" onClick={() => setShowEnvironment(!showEnvironment())}>
                {showEnvironment() ? "Hide environment" : "Show environment"}
              </button>
            </div>
            <Show when={showEnvironment()}>
              <EnvironmentView scopes={docs.map((url) => w().shown.scopes.get(url)!)} />
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}

/** The `dom` the behavior at `view` put in `scope`, under the document's title. */
function FrameView(props: { scope: Env; view: string }) {
  const { scope, view } = props
  const [dom, setDom] = createSignal<Node | null>(null)
  const [title, setTitle] = createSignal(scope.get("data").url ?? "")

  const update = () => {
    const value = scope.conflicts("dom").find((c) => c.url === view)?.handle.value
    setDom(value instanceof Node ? value : null)
  }
  update()
  onCleanup(scope.subscribe(update))
  onCleanup(
    scope.get("data/title").subscribe((value) => {
      if (typeof value === "string" && value) setTitle(value)
    }),
  )

  return (
    <div class="frame">
      <div class="frame-header">
        <span class="frame-title">{title()}</span>
        <span class="frame-view">{behaviorName(view)}</span>
      </div>
      <div class="frame-body">{dom()}</div>
    </div>
  )
}

function DiffView(props: {
  pairs: { shown: Env; baseline: Env }[]
  docs: Map<string, Recorded>
  tests: Set<string>
}) {
  const [diffs, setDiffs] = createSignal<{ title: string; rows: DiffRow[] }[]>([])
  const compute = () =>
    setDiffs(
      props.pairs.map(({ shown, baseline }) => ({
        title: titleOf(shown),
        rows: diffScopes(shown, baseline, props.docs, props.tests),
      })),
    )
  onCleanup(watchScopes(props.pairs.flatMap((p) => [p.shown, p.baseline]), compute))

  return (
    <div class="diff">
      <For each={diffs()}>
        {(diff) => (
          <div class="diff-doc">
            <div class="diff-title">{diff.title}</div>
            <Show when={diff.rows.length > 0} fallback={<div class="diff-empty">no changes</div>}>
              <For each={diff.rows}>{(row) => <DiffRowView row={row} />}</For>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}

function DiffRowView(props: { row: DiffRow }) {
  const { row } = props
  return (
    <div class="diff-row">
      <div class="diff-key">
        <code>{row.path}</code>
        <span class="diff-by">← {row.by.map(behaviorName).join(", ")}</span>
      </div>
      <Show when={row.before !== undefined}>
        <pre class="diff-before">{row.before}</pre>
      </Show>
      <Show when={row.after !== undefined}>
        <pre class="diff-after">{row.after}</pre>
      </Show>
    </div>
  )
}

function titleOf(scope: Env): string {
  const title = scope.get("data/title").value
  return typeof title === "string" && title ? title : (scope.get("data").url ?? scope.id)
}
