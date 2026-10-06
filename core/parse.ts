// An explanation's markdown, with its formulas taken out: the HTML holds an
// empty placeholder where each one goes, and the formulas come back as a list.

import { Marked, type Token, type Tokens } from "marked"

export type Formula = {
  id: number
  /** Present on a declaration. */
  name?: string
  /** An expression, or for a block the body of a function. */
  source: string
  block: boolean
}

export type Parsed = {
  /** `<span data-formula="<id>">` for a formula inline, `<div data-formula="<id>" data-block>` as a block, `<span data-reference="<name>">` for a reference. */
  html: string
  formulas: Formula[]
}

type FormulaToken = Tokens.Generic & { type: "formula"; name?: string; source: string; block: boolean; id: number }
type Scanned =
  | { kind: "reference"; raw: string; name: string }
  | { kind: "embed" | "declaration"; raw: string; name?: string; source: string }

const IDENTIFIER = /^[A-Za-z_$][\w$]*/
const BLOCK = /^js(?:\s+([A-Za-z_$][\w$]*))?\s*=\s*$/
const CLOSER: Record<string, string> = { "(": ")", "[": "]", "{": "}" }

export function parse(markdown: string): Parsed {
  const marked = createMarked(declaredNames(markdown))
  const tokens = marked.lexer(markdown)
  const formulas: Formula[] = []
  marked.walkTokens(tokens, (token) => {
    const formula = asFormula(token)
    if (!formula) return
    formula.id = formulas.length
    formulas.push({ id: formula.id, name: formula.name, source: formula.source, block: formula.block })
  })
  return { html: marked.parser(tokens), formulas }
}

/** Every name declared in `markdown`, so a reference can be told from plain text in brackets. */
function declaredNames(markdown: string): Set<string> {
  const marked = createMarked(undefined)
  const names = new Set<string>()
  marked.walkTokens(marked.lexer(markdown), (token) => {
    const name = asFormula(token)?.name
    if (name) names.add(name)
  })
  return names
}

/** A formula token, turning a ```` ```js = ```` code block into one on the way. */
function asFormula(token: Token): FormulaToken | undefined {
  if (token.type === "formula") return token as FormulaToken
  if (token.type !== "code") return undefined
  const match = BLOCK.exec((token as Tokens.Code).lang?.trim() ?? "")
  if (!match) return undefined
  return Object.assign(token, { type: "formula", name: match[1], source: (token as Tokens.Code).text, block: true }) as FormulaToken
}

function createMarked(declared: ReadonlySet<string> | undefined): Marked {
  return new Marked({
    extensions: [
      {
        name: "formula",
        level: "inline",
        start(src) {
          const i = src.indexOf("[")
          return i < 0 ? undefined : i
        },
        tokenizer(src) {
          const found = scanFormula(src, declared)
          if (!found) return undefined
          if (found.kind === "reference") return { type: "reference", raw: found.raw, name: found.name }
          return { type: "formula", raw: found.raw, name: found.name, source: found.source, block: false }
        },
        renderer: (token) => placeholder(token as FormulaToken, false),
      },
      { name: "reference", renderer: (token) => `<span data-reference="${token.name}"></span>` },
    ],
    renderer: {
      paragraph({ tokens }) {
        const embeds = tokens.filter(isEmbed)
        const onlyEmbeds = tokens.every((t) => isEmbed(t) || t.type === "br" || (t.type === "text" && !t.raw.trim()))
        if (embeds.length === 0 || !onlyEmbeds) return false
        return `<div class="embeds">${embeds.map((t) => placeholder(t as FormulaToken, true)).join("")}</div>\n`
      },
    },
  })
}

function isEmbed(token: Token): boolean {
  return token.type === "formula" && !(token as FormulaToken).name
}

function placeholder(token: FormulaToken, block: boolean): string {
  return block || token.block
    ? `<div data-formula="${token.id}" data-block></div>`
    : `<span data-formula="${token.id}"></span>`
}

/** The formula `src` starts with, if it starts with one. */
function scanFormula(src: string, declared: ReadonlySet<string> | undefined): Scanned | undefined {
  if (src[0] !== "[") return undefined
  let i = skipSpace(src, 1)
  let name: string | undefined
  if (!isAssignment(src, i)) {
    const identifier = IDENTIFIER.exec(src.slice(i))?.[0]
    if (!identifier) return undefined
    const after = i + identifier.length
    if (i === 1 && src[after] === "]") {
      if (!declared?.has(identifier) || startsLink(src, after + 1)) return undefined
      return { kind: "reference", raw: src.slice(0, after + 1), name: identifier }
    }
    i = skipSpace(src, after)
    if (!isAssignment(src, i)) return undefined
    name = identifier
  }
  const start = i + 1
  const end = closing(src, start, "]")
  if (end < 0 || startsLink(src, end + 1)) return undefined
  const source = src.slice(start, end).trim()
  if (!source) return undefined
  return { kind: name ? "declaration" : "embed", raw: src.slice(0, end + 1), name, source }
}

function isAssignment(src: string, i: number): boolean {
  return src[i] === "=" && src[i + 1] !== "=" && src[i + 1] !== ">"
}

/** Whether what follows the `]` makes it a link or a reference link. */
function startsLink(src: string, i: number): boolean {
  return src[i] === "(" || src[i] === "["
}

function skipSpace(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i])) i++
  return i
}

/** The index of the `close` that ends the code starting at `i`, past nested brackets, strings and comments; -1 if there is none. */
function closing(src: string, i: number, close: string): number {
  const open: string[] = []
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'") i = skipString(src, i)
    else if (c === "`") i = skipTemplate(src, i)
    else if (c === "/" && src[i + 1] === "/") i = src.includes("\n", i) ? src.indexOf("\n", i) : src.length
    else if (c === "/" && src[i + 1] === "*") i = src.includes("*/", i + 2) ? src.indexOf("*/", i + 2) + 2 : src.length
    else if (c in CLOSER) {
      open.push(CLOSER[c])
      i++
    } else if (c === ")" || c === "]" || c === "}") {
      if (open.length === 0) return c === close ? i : -1
      if (open.pop() !== c) return -1
      i++
    } else i++
  }
  return -1
}

function skipString(src: string, i: number): number {
  const quote = src[i++]
  while (i < src.length) {
    if (src[i] === "\\") i += 2
    else if (src[i] === quote || src[i] === "\n") return i + 1
    else i++
  }
  return src.length
}

function skipTemplate(src: string, i: number): number {
  i++
  while (i < src.length) {
    if (src[i] === "\\") i += 2
    else if (src[i] === "`") return i + 1
    else if (src[i] === "$" && src[i + 1] === "{") {
      const end = closing(src, i + 2, "}")
      if (end < 0) return src.length
      i = end + 1
    } else i++
  }
  return src.length
}
