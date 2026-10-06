// The YAML between two `---` lines at the very start of a file.

import { parse } from "yaml"

export type Split = { frontmatter: unknown; body: string }

export function splitFrontmatter(text: string): Split {
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!match) return { frontmatter: {}, body: text }
  return { frontmatter: parse(match[1]) ?? {}, body: text.slice(match[0].length) }
}
