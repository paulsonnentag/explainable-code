// What this app hosts: the behaviors under /behaviors, the views under /views,
// and the explanations under /explanations. Kept out of .tsx files: Vite's
// dependency scan reads a file with `import.meta.glob` as plain JS.

export const modules = import.meta.glob(["/behaviors/**/index.ts", "/views/**/index.ts"])

const files = import.meta.glob<string>("/explanations/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
})

/** `grouped-history` → the markdown of `/explanations/grouped-history.md`. */
export const explanations: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, text]) => [path.replace(/^\/explanations\//, "").replace(/\.md$/, ""), text]),
)
