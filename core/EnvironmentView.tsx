import { createSignal, For, onCleanup, Show } from "solid-js"
import { preview, watchScopes } from "./diff"
import type { Env } from "./environment"
import { behaviorName } from "./loader"

type Candidate = { by: string; value: string; visible: boolean }
type Binding = { key: string; from: string; candidates: Candidate[] }
type Attached = { url: string; applies: boolean; reads: string[]; error?: string }
type Snapshot = { id: string; bindings: Binding[]; behaviors: Attached[] }

/** Everything visible from each scope: its bindings and the ones it inherits, every candidate, and the behaviors attached. */
export function EnvironmentView(props: { scopes: Env[] }) {
  const [snapshots, setSnapshots] = createSignal<Snapshot[]>([])
  onCleanup(watchScopes(props.scopes, () => setSnapshots(props.scopes.map(snapshotOf))))

  return (
    <div class="environment">
      <For each={snapshots()}>
        {(scope) => (
          <div class="environment-scope">
            <div class="environment-id">{scope.id}</div>
            <div class="environment-heading">Bindings</div>
            <For each={scope.bindings}>
              {(binding) => (
                <details class="environment-binding">
                  <summary>
                    <code>{binding.key}</code>
                    <span class="environment-meta">
                      {binding.candidates.length === 1 ? binding.candidates[0].by : `${binding.candidates.length} candidates`}
                    </span>
                    <Show when={binding.from !== scope.id}>
                      <span class="environment-meta">from {binding.from}</span>
                    </Show>
                  </summary>
                  <For each={binding.candidates}>
                    {(candidate) => (
                      <div classList={{ "environment-candidate": true, hidden: !candidate.visible }}>
                        <div class="environment-meta">
                          {candidate.by}
                          {candidate.visible ? " (visible)" : ""}
                        </div>
                        <pre>{candidate.value}</pre>
                      </div>
                    )}
                  </For>
                </details>
              )}
            </For>
            <div class="environment-heading">Behaviors</div>
            <For each={scope.behaviors}>
              {(behavior) => (
                <div classList={{ "environment-behavior": true, inactive: !behavior.applies }}>
                  <code>{behaviorName(behavior.url)}</code>
                  <span class="environment-meta">{behavior.applies ? "applies" : "doesn't apply"}</span>
                  <span class="environment-meta">reads {behavior.reads.join(", ") || "nothing"}</span>
                  <Show when={behavior.error}>
                    <span class="environment-error">{behavior.error}</span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  )
}

function snapshotOf(scope: Env): Snapshot {
  const seen = new Set<string>()
  const bindings: Binding[] = []
  for (let s: Env | undefined = scope; s; s = s.parent) {
    for (const key of Object.keys(s.entries())) {
      if (seen.has(key)) continue // shadowed by a scope below
      seen.add(key)
      const conflicts = s.conflicts(key)
      const anyChosen = conflicts.some((c) => c.chosen)
      bindings.push({
        key,
        from: s.id,
        candidates: conflicts.map((c, i) => ({
          by: c.url ? behaviorName(c.url) : "(world)",
          value: preview(c.handle.value),
          visible: anyChosen ? c.chosen : i === conflicts.length - 1,
        })),
      })
    }
  }
  const behaviors = scope.behaviors.map((b) => ({
    url: b.url,
    applies: b.teardown !== undefined,
    reads: Object.keys(b.reads),
    error: b.error,
  }))
  return { id: scope.id, bindings, behaviors }
}
