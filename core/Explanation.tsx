import { marked, type Token, type Tokens } from "marked"
import { For, Match, Switch } from "solid-js"
import { parseExample } from "./example"
import { ExampleView } from "./ExampleView"
import type { Runtime } from "./runtime"

type Part = { kind: "prose"; html: string } | { kind: "example"; text: string }

/** An explanation: its prose, with every ```json example block run in place. */
export function Explanation(props: { markdown: string; runtime: Runtime }) {
  return (
    <article class="explanation">
      <For each={parts(props.markdown)}>
        {(part) => (
          <Switch>
            <Match when={part.kind === "prose" && part}>{(p) => <div class="prose" innerHTML={p().html} />}</Match>
            <Match when={part.kind === "example" && part}>
              {(p) => <ExampleBlock text={p().text} runtime={props.runtime} />}
            </Match>
          </Switch>
        )}
      </For>
    </article>
  )
}

function ExampleBlock(props: { text: string; runtime: Runtime }) {
  try {
    return <ExampleView example={parseExample(props.text)} runtime={props.runtime} />
  } catch (e) {
    return <div class="error">Example: {String((e as Error)?.message ?? e)}</div>
  }
}

function parts(markdown: string): Part[] {
  const tokens = marked.lexer(markdown)
  const out: Part[] = []
  let prose: Token[] = []
  const flush = () => {
    if (prose.length === 0) return
    out.push({ kind: "prose", html: marked.parser(Object.assign(prose, { links: tokens.links })) })
    prose = []
  }
  for (const token of tokens) {
    if (token.type === "code" && (token as Tokens.Code).lang?.trim() === "json example") {
      flush()
      out.push({ kind: "example", text: (token as Tokens.Code).text })
    } else prose.push(token)
  }
  flush()
  return out
}
