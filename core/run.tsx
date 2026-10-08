// What `Run` returns: a behavior's run, read as its record (`reads`, `writes`,
// …) and drawn as what it read and wrote. Every row unfolds to the whole
// value.

import { createSignal, Index, Show, type Accessor, type JSX } from "solid-js"
import { isDocBacked } from "./handle"
import type { BehaviorRun } from "./record"
import { Chip, DRAW, Failure, isComposite, Json, Url, type Drawable, type Page } from "./render"

export type RunValue = Readonly<BehaviorRun> & Drawable

export function runValue(record: Accessor<BehaviorRun | undefined>, behavior: string, document: string): RunValue {
  const current = () => record() ?? { behavior, document, reads: [], puts: [], creates: [], writes: [] }
  const value: RunValue = {
    behavior,
    document,
    get reads() {
      return current().reads
    },
    get puts() {
      return current().puts
    },
    get creates() {
      return current().creates
    },
    get writes() {
      return current().writes
    },
    get error() {
      return current().error
    },
    [DRAW]: (page) => <Diff run={current} page={page} self={value} />,
  }
  return value
}

/** The run in a frame: a "read" row of keys, and "+" lines for what it put, created and wrote. */
function Diff(props: { run: Accessor<BehaviorRun>; page: Page; self: object }) {
  const name = () => props.page.nameOf(props.self)
  const own = (write: BehaviorRun["writes"][number]) => write.document === props.run().document
  return (
    <figure class="figure run" data-name={name()}>
      <div class="frame run-body">
        <span class="run-label">read</span>
        <div class="run-rows">
          <Index each={props.run().reads} fallback={<span class="run-muted">nothing</span>}>
            {(read) => <Row line={<Key>{read().key}</Key>} summary={read().value} detail={read().value} page={props.page} />}
          </Index>
        </div>
        <span class="run-label">write</span>
        <div class="run-rows">
          <Index each={props.run().puts}>
            {(put) => (
              <Row added line={<Key>{put().key}</Key>} summary={put().value} detail={put().value} page={props.page} />
            )}
          </Index>
          <Index each={props.run().writes.filter(own)}>
            {(write) => (
              <Row
                added
                line={<Key>{["data", ...write().path].join("/")}</Key>}
                summary={write().value}
                detail={write().value}
                page={props.page}
              />
            )}
          </Index>
          <Index each={props.run().creates}>
            {(create) => (
              <Row
                added
                line={<Url url={create().document} page={props.page} />}
                note="new document"
                detail={create().value}
                page={props.page}
              />
            )}
          </Index>
          <Index each={props.run().writes.filter((write) => !own(write))}>
            {(write) => (
              <Row
                added
                line={
                  <>
                    <Url url={write().document} page={props.page} />
                    <Path path={write().path} page={props.page} />
                  </>
                }
                summary={write().value}
                detail={write().value}
                page={props.page}
              />
            )}
          </Index>
          <Show
            when={
              props.run().puts.length + props.run().writes.length + props.run().creates.length === 0 && !props.run().error
            }
          >
            <span class="run-muted">nothing</span>
          </Show>
        </div>
        <Show when={props.run().error}>
          {(error) => (
            <>
              <span class="run-label">failed</span>
              <Failure error={new Error(error())} />
            </>
          )}
        </Show>
      </div>
      <figcaption class="caption">
        <Show when={name()}>{(shown) => <Chip name={shown()} page={props.page} />}</Show>
        <span class="caption-as">{behaviorName(props.run().behavior)} on</span>
        <Url url={props.run().document} page={props.page} />
      </figcaption>
    </figure>
  )
}

/** One read or write: its line, a short summary of the value, and the whole value below once unfolded. */
function Row(props: { line: JSX.Element; summary?: unknown; note?: string; detail: unknown; added?: boolean; page: Page }) {
  const [open, setOpen] = createSignal(false)
  return (
    <div class="run-row">
      <div class="run-line" onClick={() => setOpen(!open())}>
        <span class="run-caret">{open() ? "▾" : "▸"}</span>
        {props.added && <span class="run-plus">+</span>}
        {props.line}
        <Show when={props.note === undefined} fallback={<span class="run-muted">{props.note}</span>}>
          <span class="json-punct">:</span>
          {summary(props.summary, props.page)}
        </Show>
      </div>
      <Show when={open()}>
        <div class="run-detail json">{whole(props.detail, props.page)}</div>
      </Show>
    </div>
  )
}

function Key(props: { children: string }) {
  return <span class="run-key">{props.children}</span>
}

/** `/clones/automerge:…`, with urls drawn as names. */
function Path(props: { path: string[]; page: Page }) {
  return (
    <span class="run-key">
      <Index each={props.path}>
        {(step) => (
          <>
            /{step().startsWith("automerge:") ? <Url url={step()} page={props.page} /> : step()}
          </>
        )}
      </Index>
    </span>
  )
}

/** A value in full; a document as what it holds. */
function whole(value: unknown, page: Page): JSX.Element {
  return <Json value={isDocBacked(value) ? value.value : value} page={page} depth={0} />
}

/** A value, short: documents and urls by name, strings quoted, lists and objects counted. */
function summary(value: unknown, page: Page): JSX.Element {
  if (isDocBacked(value)) return <Url url={value.url} page={page} />
  if (typeof value === "string" && value.startsWith("automerge:")) return <Url url={value} page={page} />
  if (typeof value === "string")
    return <span class="json-string">{JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value)}</span>
  if (Array.isArray(value)) return <span class="json-muted">{`[${value.length} ${value.length === 1 ? "item" : "items"}]`}</span>
  if (isComposite(value)) {
    const keys = Object.keys(value as object).length
    return <span class="json-muted">{`{${keys} ${keys === 1 ? "key" : "keys"}}`}</span>
  }
  return <Json value={value} page={page} depth={0} />
}

/** `/behaviors/drafts/overlay/index.ts` → "drafts/overlay". */
function behaviorName(url: string): string {
  return url.replace(/^\/behaviors\//, "").replace(/\/index\.[jt]sx?$/, "")
}
