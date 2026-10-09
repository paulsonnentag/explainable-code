import { createMemo, createSignal, For, from, Index, mapArray, onCleanup, Show, type Accessor } from "solid-js"
import { render } from "solid-js/web"
import { behavior, type Entry, type Env } from "@/core"
import { getEnvironmentById } from "@/core/debug"

/**
 * Applies where `data/type` is "inspector": a document about the scope whose id is `data/target`,
 * with a section for every behavior that applied there. Each section is a scope with the behavior's
 * environment at `data` and the section's body at `dom`, for explanations to draw into; a behavior
 * that nothing explains shows what it put instead.
 */
export const inspector = behavior("inspector", (env) => {
  if (env.get<string>("data/type").get() !== "inspector") return
  const dom = env.get<HTMLElement>("dom").get()
  const id = env.get<string>("data/target").get()
  if (!dom || !id) return
  const target = getEnvironmentById(env, id).get()
  return render(() => <Document inspector={env} id={id} target={target} />, dom)
})

function Document(props: { inspector: Env; id: string; target: Env | undefined }) {
  const behaviors = props.target ? appliedBehaviors(props.target) : () => []
  let sections!: HTMLDivElement
  const scrollTo = (env: Env) =>
    sections.querySelector(`[data-section="${CSS.escape(env.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  return (
    <div class="inspector">
      <nav class="toc">
        <div class="toc-target">{short(props.id)}</div>
        <For each={behaviors()}>
          {(env) => (
            <div class="toc-entry" onClick={() => scrollTo(env)}>
              {env.behavior?.name}
            </div>
          )}
        </For>
      </nav>
      <div class="sections" ref={sections}>
        <Show when={props.target} fallback={<p class="muted">This environment is gone.</p>}>
          <For each={behaviors()} fallback={<p class="muted">No behavior applies here.</p>}>
            {(env) => <Section inspector={props.inspector} env={env} />}
          </For>
        </Show>
      </div>
    </div>
  )
}

/** One behavior's section: a scope for explanations to draw into, or its entries if none does. */
function Section(props: { inspector: Env; env: Env }) {
  const scope = props.inspector.fork(lastSegment(props.env.id))
  onCleanup(() => scope.destroy())
  scope.put("data", props.env)
  const explanations = appliedBehaviors(scope)
  const reads = from(props.env.reads)
  return (
    <section class="section" data-section={props.env.id}>
      <h2>{props.env.behavior?.name}</h2>
      <Show when={reads()?.length}>
        <div class="reads">
          <span class="label">reads</span> {reads()?.join(", ")}
        </div>
      </Show>
      <div class="explanation" ref={(element) => scope.put("dom", element)} />
      <Show when={explanations().length === 0}>
        <Entries env={props.env} />
      </Show>
    </section>
  )
}

function Entries(props: { env: Env }) {
  const entries = from(props.env.ownEntries)
  return (
    <div class="entries">
      <Index each={entries()} fallback={<span class="muted">puts nothing</span>}>
        {(entry) => <EntryRow entry={entry} />}
      </Index>
    </div>
  )
}

function EntryRow(props: { entry: Accessor<Entry> }) {
  return (
    <div class="entry">
      <span class="key">{props.entry().key}</span>
      <Value value={props.entry().value} />
      <Show when={props.entry().setBy}>{(by) => <span class="set-by">set by {short(by().id)}</span>}</Show>
    </div>
  )
}

function Value(props: { value: unknown }) {
  return (
    <Show when={isPlain(props.value)} fallback={<span class={`atom ${kindOf(props.value)}`}>{atom(props.value)}</span>}>
      <Fold value={props.value as Record<string, unknown>} />
    </Show>
  )
}

function Fold(props: { value: Record<string, unknown> }) {
  const [open, setOpen] = createSignal(false)
  const size = () => Object.keys(props.value).length
  const brackets = () => (Array.isArray(props.value) ? ["[", "]"] : ["{", "}"])
  return (
    <span class="fold">
      <span class="fold-toggle" onClick={() => setOpen(!open())}>
        {open() ? brackets()[0] : `${brackets()[0]}${size()}${brackets()[1]}`}
      </span>
      <Show when={open()}>
        <div class="fold-body">
          <Index each={Object.entries(props.value)}>
            {(pair) => (
              <div class="entry">
                <span class="key">{pair()[0]}</span>
                <Value value={pair()[1]} />
              </div>
            )}
          </Index>
        </div>
        <span class="fold-toggle" onClick={() => setOpen(false)}>
          {brackets()[1]}
        </span>
      </Show>
    </span>
  )
}

/** The environments of the behaviors that applied in `env`, kept up to date. */
function appliedBehaviors(env: Env): Accessor<Env[]> {
  const children = from(env.children)
  const states = createMemo(
    mapArray(
      () => (children() ?? []).filter((child) => child.behavior),
      (child) => ({ env: child, applied: from(child.applied) }),
    ),
  )
  return () => states().flatMap((state) => (state.applied() ? [state.env] : []))
}

function atom(value: unknown): string {
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "function") return "ƒ"
  if (value instanceof Element) return `<${value.tagName.toLowerCase()}${value.className ? `.${value.className}` : ""}>`
  if (typeof value === "object") return value.constructor?.name ?? "object"
  return String(value)
}

function kindOf(value: unknown): string {
  if (value === null || value === undefined) return "nil"
  if (value instanceof Element) return "element"
  return typeof value
}

function isPlain(value: unknown): boolean {
  if (Array.isArray(value)) return true
  if (value === null || typeof value !== "object") return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function lastSegment(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1)
}

/** An id with every uuid in it cut to its first four characters. */
function short(id: string): string {
  return id.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (uuid) => uuid.slice(0, 4))
}
