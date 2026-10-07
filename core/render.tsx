// What goes in a formula's placeholder: an embed's value, drawn by the default
// renderer, or a name as a chip.

import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch, type Accessor, type JSX } from "solid-js"
import { render } from "solid-js/web"
import type { State } from "./evaluate"
import type { Shows } from "./host"
import type { Formula } from "./parse"

/** What every placeholder on a page shares. */
export type Page = {
  state(id: number): State
  /** The declaration of `name`, if there is one. */
  declaration(name: string): Formula | undefined
  /** The name declared for a document's url, or for a value. */
  nameOf(urlOrValue: unknown): string | undefined
  /** What a node returned by `View` shows. */
  viewOf(node: Node): Shows | undefined
  hovered: Accessor<string | undefined>
  hover(name: string | undefined): void
  /** Whether a formula's code is unfolded. Tracked. */
  unfolded(id: number): boolean
  /** Unfolds a formula's code, or folds it again. */
  toggle(id: number): void
  /** Unfolds a name's code where it is declared and scrolls there, or folds it if it is already unfolded on screen. */
  reveal(name: string): void
}

const LIMIT = 200 // entries of an array or object drawn before the rest is summed up
const HASH = /^[0-9a-f]{64}$/
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/
/** Code up to this long, on one line, unfolds inline next to its chip. */
const SIMPLE = 60
/** What a chip's code unfolds after: the nearest block around it. */
const BLOCK = ".embeds, p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th"

export function FormulaSlot(props: { formula: Formula; block: boolean; page: Page }) {
  const { formula, page } = props
  if (formula.name && formula.block)
    return (
      <Show when={page.unfolded(formula.id)}>
        <BlockCard formula={formula} name={formula.name} page={page} />
      </Show>
    )
  if (formula.name) return <Chip name={formula.name} page={page} declaration />
  const state = () => page.state(formula.id)
  const named = IDENTIFIER.test(formula.source) && page.declaration(formula.source) ? formula.source : undefined
  const unfolded = () => !named && page.unfolded(formula.id)
  if (!props.block)
    return (
      <span class="embed-inline">
        <Show when={unfolded()}>
          <code class="unfold-inline">
            <Code source={formula.source} page={page} />
          </code>{" "}
        </Show>
        <Shown state={state} page={page} block={false} named={named} />
      </span>
    )
  return (
    <div class="embed">
      <Show when={unfolded()}>
        <div class="unfold unfold-block">
          <Unfolded formula={formula} page={page} />
        </div>
      </Show>
      <Shown state={state} page={page} block named={named} />
    </div>
  )
}

/**
 * A name. Hovering highlights it everywhere, and every view of it. Clicking a
 * declaration unfolds its code: inline when it is short, otherwise below the
 * line. Clicking anywhere else goes to the declaration and unfolds it there.
 */
export function Chip(props: { name: string; page: Page; declaration?: boolean }) {
  const formula = () => props.page.declaration(props.name)
  const state = (): State | undefined => {
    const found = formula()
    return found && props.page.state(found.id)
  }
  const unfolded = () => {
    const found = formula()
    return Boolean(props.declaration && found && props.page.unfolded(found.id))
  }
  const simple = () => {
    const found = formula()
    return found !== undefined && isSimple(found)
  }
  let chip!: HTMLSpanElement

  createEffect(() => {
    const found = formula()
    if (!unfolded() || !found || simple()) return
    const block = chip.closest(BLOCK) ?? chip.parentElement
    if (!block) return
    const card = document.createElement("div")
    card.className = "unfold"
    const left = chip.getBoundingClientRect().left + chip.offsetWidth / 2 - block.getBoundingClientRect().left
    card.style.setProperty("--caret", `${Math.max(16, left)}px`)
    let anchor: Element = block
    while (anchor.nextElementSibling?.classList.contains("unfold")) anchor = anchor.nextElementSibling
    anchor.after(card)
    const dispose = render(() => <Unfolded formula={found} page={props.page} />, card)
    onCleanup(() => {
      dispose()
      card.remove()
    })
  })

  return (
    <>
      <span
        ref={chip}
        class="chip"
        data-name={props.name}
        classList={{
          highlighted: props.page.hovered() === props.name,
          pending: state()?.status === "pending",
          failed: state()?.status === "failed",
        }}
        onMouseEnter={() => props.page.hover(props.name)}
        onMouseLeave={() => props.page.hover(undefined)}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const found = formula()
          if (!found) return
          if (props.declaration) props.page.toggle(found.id)
          else props.page.reveal(props.name)
        }}
      >
        {displayName(props.name)}
      </span>
      <Show when={unfolded() && simple()}>
        <code class="unfold-inline">
          <span class="code-punct">= </span>
          <Code source={formula()!.source} page={props.page} />
        </code>
        <Show when={state()?.status === "failed"}>
          {" "}
          <Failure error={(state() as { error: unknown }).error} />
        </Show>
      </Show>
    </>
  )
}

/** A block declaration's code, its caret pointing up at the name's chip in the paragraph above, if there is one. */
function BlockCard(props: { formula: Formula; name: string; page: Page }) {
  const [caret, setCaret] = createSignal<number>()
  let card!: HTMLDivElement
  onMount(() => {
    let above = card.parentElement?.previousElementSibling
    while (above?.classList.contains("unfold")) above = above.previousElementSibling
    const chips = above?.querySelectorAll<HTMLElement>(`.chip[data-name="${CSS.escape(props.name)}"]`)
    const chip = chips?.[chips.length - 1]
    if (!chip) return
    const box = chip.getBoundingClientRect()
    setCaret(Math.max(16, box.left + box.width / 2 - card.getBoundingClientRect().left))
  })
  return (
    <div
      ref={card}
      class="unfold"
      classList={{ "unfold-block": caret() === undefined }}
      style={caret() === undefined ? undefined : { "--caret": `${caret()}px` }}
    >
      <Unfolded formula={props.formula} page={props.page} />
    </div>
  )
}

function isSimple(formula: Formula): boolean {
  const source = formula.source.trim()
  return !formula.block && !source.includes("\n") && source.length <= SIMPLE
}

/** A formula's code, as unfolded on a card, with what went wrong if it failed. */
function Unfolded(props: { formula: Formula; page: Page }) {
  const error = () => {
    const state = props.page.state(props.formula.id)
    return state.status === "failed" ? state.error : undefined
  }
  return (
    <>
      <pre class="unfold-code">
        <Code source={props.formula.source} page={props.page} />
      </pre>
      <Show when={error() !== undefined}>
        <div class="unfold-error">
          <Failure error={error()} />
        </div>
      </Show>
    </>
  )
}

/** `grouped_history` → "grouped history". */
export function displayName(name: string): string {
  return name.replaceAll("_", " ")
}

/** JavaScript, lightly highlighted. Declared names are drawn like chips. */
export function Code(props: { source: string; page: Page }) {
  const TOKEN =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|return|function|async|await|new|if|else|for|of|in|true|false|null|undefined|typeof)\b|([A-Za-z_$][\w$]*)/g
  const parts: JSX.Element[] = []
  let last = 0
  for (const match of props.source.matchAll(TOKEN)) {
    if (match.index > last) parts.push(props.source.slice(last, match.index))
    const [text, comment, string, number, keyword, identifier] = match
    const end = match.index + text.length
    const kind = comment
      ? "comment"
      : string
        ? "string"
        : number
          ? "number"
          : keyword
            ? "keyword"
            : identifier && props.page.declaration(identifier) && props.source[match.index - 1] !== "."
              ? "name"
              : identifier && /^\s*\(/.test(props.source.slice(end))
                ? "call"
                : undefined
    parts.push(kind ? <span class={`code-${kind}`}>{text}</span> : text)
    last = end
  }
  parts.push(props.source.slice(last))
  return <>{parts}</>
}

/**
 * A state: a spinner, an error, or the value. As a block, a view sits in its
 * frame captioned with what it shows; anything else must be a named value, and
 * is captioned with its name.
 */
function Shown(props: { state: () => State; page: Page; block: boolean; named: string | undefined }) {
  const status = createMemo(() => props.state().status)
  const value = createMemo(() => {
    const state = props.state()
    return state.status === "resolved" ? state.value : undefined
  })
  const error = createMemo(() => {
    const state = props.state()
    return state.status === "failed" ? state.error : undefined
  })
  const drawn = createMemo(() => drawTop(value(), props.page, props.block, props.named))
  const inFrame = (content: JSX.Element) => (props.block ? <div class="frame frame-data">{content}</div> : content)
  return (
    <Switch>
      <Match when={status() === "pending"}>{inFrame(<span class="spinner" />)}</Match>
      <Match when={status() === "failed"}>{inFrame(<Failure error={error()} />)}</Match>
      <Match when={status() === "resolved"}>{drawn()}</Match>
    </Switch>
  )
}

function drawTop(value: unknown, page: Page, block: boolean, named: string | undefined): JSX.Element {
  if (value instanceof Node) {
    const shows = page.viewOf(value)
    if (shows) return <Figure node={value} shows={shows} page={page} />
    if (!block) return value
  }
  const content = isComposite(value) ? (
    <span class="json">
      <Json value={value} page={page} depth={0} />
    </span>
  ) : typeof value === "string" ? (
    value
  ) : (
    leaf(value, page)
  )
  if (!block) return content
  if (!named)
    return (
      <div class="frame frame-data">
        <Failure error={new Error("Only a view or a named value can be embedded on its own. Declare this value and embed its name.")} />
      </div>
    )
  return (
    <figure class="figure" classList={{ highlighted: page.hovered() === named }}>
      <div class="frame frame-data">{value instanceof Node ? value : content}</div>
      <figcaption class="caption">
        <Chip name={named} page={page} />
      </figcaption>
    </figure>
  )
}

/** A view in its frame, captioned with the value it shows and the view it is shown as. */
function Figure(props: { node: Node; shows: Shows; page: Page }) {
  const name = () => props.page.nameOf(props.shows.document ?? props.shows.data)
  return (
    <figure class="figure" classList={{ highlighted: name() !== undefined && props.page.hovered() === name() }}>
      <div class="frame">{props.node}</div>
      <figcaption class="caption">
        <Show when={name()}>{(shown) => <Chip name={shown()} page={props.page} />}</Show>
        <span class="caption-view">as {viewName(props.shows.view)}</span>
      </figcaption>
    </figure>
  )
}

/** `/views/history/index.ts` → "history". */
function viewName(url: string): string {
  return (url.replace(/\/index\.[jt]sx?$/, "").split("/").pop() ?? url).replaceAll("-", " ")
}

function Failure(props: { error: unknown }) {
  const error = props.error
  return (
    <span class="value-error" title={error instanceof Error ? error.stack : undefined}>
      {error instanceof Error ? error.message : String(error)}
    </span>
  )
}

/** Structured data, written out like JSON. Arrays and objects fold by clicking their bracket. */
function Json(props: { value: unknown; page: Page; depth: number }): JSX.Element {
  if (!isComposite(props.value)) return leaf(props.value, props.page)
  const array = Array.isArray(props.value)
  const entries: [string, unknown][] = array
    ? (props.value as unknown[]).map((item, i) => [String(i), item])
    : Object.entries(props.value as object)
  const [opening, closing] = array ? ["[", "]"] : ["{", "}"]
  if (entries.length === 0) return <span class="json-punct">{opening + closing}</span>
  const small = entries.length <= 5 && entries.every(([, child]) => !isComposite(child) || (Array.isArray(child) && child.length <= 1))
  const [open, setOpen] = createSignal(props.depth < 2 || small)
  const count = `${entries.length} ${array ? "item" : "key"}${entries.length === 1 ? "" : "s"}`
  return (
    <span class="json-composite">
      <span class="json-bracket" onClick={() => setOpen(!open())} title={open() ? "Fold" : "Unfold"}>
        {opening}
      </span>
      <Show
        when={open()}
        fallback={
          <span class="json-folded" onClick={() => setOpen(true)}>
            {count}
          </span>
        }
      >
        <span class="json-body">
          <For each={entries.slice(0, LIMIT)}>
            {([key, child], i) => (
              <span class="json-line">
                {!array && (
                  <>
                    <span class="json-key">{JSON.stringify(key)}</span>
                    <span class="json-punct">: </span>
                  </>
                )}
                <Json value={child} page={props.page} depth={props.depth + 1} />
                {i() < entries.length - 1 && <span class="json-punct">,</span>}
              </span>
            )}
          </For>
          {entries.length > LIMIT && <span class="json-line json-muted">… {entries.length - LIMIT} more</span>}
        </span>
      </Show>
      <span class="json-bracket" onClick={() => setOpen(!open())}>
        {closing}
      </span>
    </span>
  )
}

function leaf(value: unknown, page: Page): JSX.Element {
  if (value === undefined) return <span class="json-muted">undefined</span>
  if (value === null) return <span class="json-muted">null</span>
  if (typeof value === "string") {
    if (HASH.test(value))
      return (
        <span class="json-string" title={value}>
          "{value.slice(0, 8)}…"
        </span>
      )
    if (value.startsWith("automerge:")) return <Url url={value} page={page} />
    return <span class="json-string">{JSON.stringify(value)}</span>
  }
  if (typeof value === "number" || typeof value === "bigint") return <span class="json-number">{String(value)}</span>
  if (typeof value === "boolean") return <span class="json-boolean">{String(value)}</span>
  if (value instanceof Date) return <span class="json-date">{value.toLocaleString()}</span>
  if (value instanceof Uint8Array) return <span class="json-muted">{`<${value.length} bytes>`}</span>
  if (typeof value === "function") return <span class="json-muted">ƒ {value.name || "anonymous"}</span>
  if (value instanceof Node) return <span class="json-muted">‹{value.nodeName.toLowerCase()}›</span>
  return <span>{String(value)}</span>
}

/** A document's url: its name's chip once the document is declared, the url until then. */
function Url(props: { url: string; page: Page }) {
  return (
    <Show when={props.page.nameOf(props.url)} fallback={<span class="json-string">{JSON.stringify(props.url)}</span>}>
      {(name) => <Chip name={name()} page={props.page} />}
    </Show>
  )
}

function isComposite(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Node) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  )
}
