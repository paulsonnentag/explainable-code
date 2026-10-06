// What this app hosts: the behaviors under /behaviors, and their explanations.
// Kept out of .tsx files: Vite's dependency scan reads a file with
// `import.meta.glob` as plain JS.

export const behaviors = import.meta.glob("/behaviors/**/index.ts")

const files = import.meta.glob<string>("/behaviors/**/explanation.md", {
  query: "?raw",
  import: "default",
  eager: true,
})

/** `history/group` → the markdown of `/behaviors/history/group/explanation.md`. */
export const explanations: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, text]) => [
    path.replace(/^\/behaviors\//, "").replace(/\/explanation\.md$/, ""),
    text,
  ]),
)
