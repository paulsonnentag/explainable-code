import { createEffect, createSignal, For, onCleanup, onMount } from "solid-js"
import { render } from "solid-js/web"
import type { Run } from "./environment"
import { evaluate, type Evaluation, type State } from "./evaluate"
import { splitFrontmatter } from "./frontmatter"
import { createHost, type Host, type Loaded, type Runtime } from "./host"
import { parse, type Formula, type Parsed } from "./parse"
import { Chip, FormulaSlot, pages, type Page } from "./render"

const PENDING: State = { status: "pending" }

/**
 * An explanation: its prose, with every formula in place. The behaviors in the
 * frontmatter load first; then every formula is evaluated.
 */
export function Explanation(props: { name: string; markdown: string; runtime: Runtime }) {
  const [problems, setProblems] = createSignal<string[]>([])
  const [running, setRunning] = createSignal<{ evaluation: Evaluation; host: Host }>()
  const [hovered, setHovered] = createSignal<string>()
  const [revealed, setRevealed] = createSignal(false)
  const [unfolded, setUnfolded] = createSignal(new Set<number>(), { equals: false })
  const placeholders = new Map<number, HTMLElement>()
  const disposers: (() => void)[] = []
  let cancelled = false
  let prose!: HTMLDivElement
  let article!: HTMLElement

  const read = readExplanation(props.markdown)
  if ("problem" in read) setProblems([read.problem])

  const page: Page = {
    state: (id) => running()?.evaluation.state(id) ?? PENDING,
    declaration: (name) => ("parsed" in read ? read.declarations.get(name) : undefined),
    nameOf: (urlOrValue) => running()?.host.nameOf(urlOrValue),
    hovered,
    hover: setHovered,
    unfolded: (id) => unfolded().has(id),
    toggle(id) {
      const ids = unfolded()
      if (!ids.delete(id)) ids.add(id)
      setUnfolded(ids)
    },
    reveal(name) {
      const formula = page.declaration(name)
      if (!formula) return
      const placeholder = placeholders.get(formula.id)
      if (unfolded().has(formula.id) && placeholder && onScreen(placeholder)) return page.toggle(formula.id)
      setUnfolded(unfolded().add(formula.id))
      requestAnimationFrame(() => placeholder?.scrollIntoView({ behavior: "smooth", block: "center" }))
    },
  }

  const toggleAll = () => {
    const reveal = !revealed()
    setRevealed(reveal)
    const formulas = "parsed" in read ? read.parsed.formulas : []
    setUnfolded(new Set(reveal ? formulas.map((formula) => formula.id) : []))
  }

  if ("parsed" in read) {
    loadBehaviors(read.behaviors, props.runtime).then(({ loaded, failures }) => {
      if (cancelled) return
      setProblems(failures)
      const host = createHost(props.runtime, loaded, props.name)
      setRunning({ evaluation: evaluate(read.parsed.formulas, host), host })
    })
  }

  onMount(() => pages.set(article, page))

  createEffect(() => {
    const name = hovered()
    for (const element of article.querySelectorAll<HTMLElement>("[data-name]:not(.chip)"))
      element.classList.toggle("highlighted", element.dataset.name === name)
  })

  onMount(() => {
    if (!("parsed" in read)) return
    prose.innerHTML = read.parsed.html
    for (const element of prose.querySelectorAll<HTMLElement>("[data-formula]")) {
      const formula = read.parsed.formulas[Number(element.dataset.formula)]
      const block = element.hasAttribute("data-block")
      placeholders.set(formula.id, element)
      disposers.push(render(() => <FormulaSlot formula={formula} block={block} page={page} />, element))
    }
    for (const element of prose.querySelectorAll<HTMLElement>("[data-reference]")) {
      const name = element.dataset.reference!
      disposers.push(render(() => <Chip name={name} page={page} />, element))
    }
  })

  onCleanup(() => {
    cancelled = true
    for (const dispose of disposers) dispose()
    running()?.evaluation.dispose()
    running()?.host.destroy()
  })

  return (
    <article class="explanation" ref={article}>
      <div class="toolbar">
        <button class="toggle" classList={{ on: revealed() }} onClick={toggleAll}>
          {revealed() ? "Hide code" : "Show code"}
        </button>
      </div>
      <For each={problems()}>{(problem) => <div class="error">{problem}</div>}</For>
      <div class="prose" ref={prose} />
    </article>
  )
}

function onScreen(element: Element): boolean {
  const box = element.getBoundingClientRect()
  return box.bottom > 0 && box.top < window.innerHeight
}

type Read =
  | { parsed: Parsed; behaviors: string[]; declarations: Map<string, Formula> }
  | { problem: string }

function readExplanation(markdown: string): Read {
  let split
  try {
    split = splitFrontmatter(markdown)
  } catch (error) {
    return { problem: `Frontmatter: ${(error as Error).message}` }
  }
  const { behaviors = [] } = (split.frontmatter ?? {}) as { behaviors?: unknown }
  if (!Array.isArray(behaviors) || !behaviors.every((url) => typeof url === "string"))
    return { problem: "Frontmatter: behaviors must be a list of urls" }
  const parsed = parse(split.body)
  const declarations = new Map<string, Formula>()
  for (const formula of parsed.formulas) {
    if (formula.name && !declarations.has(formula.name)) declarations.set(formula.name, formula)
  }
  return { parsed, behaviors, declarations }
}

async function loadBehaviors(urls: string[], runtime: Runtime): Promise<{ loaded: Loaded[]; failures: string[] }> {
  const results = await Promise.allSettled(urls.map((url) => runtime.load<Run>(url)))
  const loaded: Loaded[] = []
  const failures: string[] = []
  results.forEach((result, i) => {
    if (result.status === "fulfilled") loaded.push({ url: urls[i], run: result.value })
    else failures.push(`${urls[i]} failed to load: ${(result.reason as Error)?.message ?? result.reason}`)
  })
  return { loaded, failures }
}
