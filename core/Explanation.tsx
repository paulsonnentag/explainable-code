import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { render } from "solid-js/web"
import { evaluate } from "./evaluate"
import { createHost, type Runtime } from "./host"
import { parse, type Formula } from "./parse"
import { Chip, FormulaSlot, pages, type Page } from "./render"

/** An explanation: its prose, with every formula in place and evaluated. */
export function Explanation(props: { name: string; markdown: string; runtime: Runtime }) {
  const [hovered, setHovered] = createSignal<string>()
  const [revealed, setRevealed] = createSignal(false)
  const [unfolded, setUnfolded] = createSignal(new Set<number>(), { equals: false })
  const placeholders = new Map<number, HTMLElement>()
  const disposers: (() => void)[] = []
  let prose!: HTMLDivElement
  let article!: HTMLElement

  const parsed = parse(props.markdown)
  const declarations = new Map<string, Formula>()
  for (const formula of parsed.formulas) {
    if (formula.name && !declarations.has(formula.name)) declarations.set(formula.name, formula)
  }
  const host = createHost(props.runtime, props.name)
  const evaluation = evaluate(parsed.formulas, host)

  const page: Page = {
    state: (id) => evaluation.state(id),
    declaration: (name) => declarations.get(name),
    nameOf: (urlOrValue) => host.nameOf(urlOrValue),
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
    setUnfolded(new Set(reveal ? parsed.formulas.map((formula) => formula.id) : []))
  }

  onMount(() => pages.set(article, page))

  createEffect(() => {
    const name = hovered()
    for (const element of article.querySelectorAll<HTMLElement>("[data-name]:not(.chip)"))
      element.classList.toggle("highlighted", element.dataset.name === name)
  })

  onMount(() => {
    prose.innerHTML = parsed.html
    for (const element of prose.querySelectorAll<HTMLElement>("[data-formula]")) {
      const formula = parsed.formulas[Number(element.dataset.formula)]
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
    for (const dispose of disposers) dispose()
    evaluation.dispose()
    host.destroy()
  })

  return (
    <article class="explanation" ref={article}>
      <div class="toolbar">
        <button class="toggle" classList={{ on: revealed() }} onClick={toggleAll}>
          {revealed() ? "Hide code" : "Show code"}
        </button>
      </div>
      <div class="prose" ref={prose} />
    </article>
  )
}

function onScreen(element: Element): boolean {
  const box = element.getBoundingClientRect()
  return box.bottom > 0 && box.top < window.innerHeight
}
