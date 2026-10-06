// Behaviors are linked by url. The app hands over the ones it hosts (bundled,
// so they share its single copy of every library); any other url is imported
// as is.

import type { Run } from "./environment"

export type Hosted = Record<string, () => Promise<unknown>>
export type Load = (url: string) => Promise<Run>

export function createLoader(hosted: Hosted): Load {
  const loaded = new Map<string, Promise<Run>>()
  return (url) => {
    let run = loaded.get(url)
    if (!run) {
      const load = hosted[url] ?? (() => import(/* @vite-ignore */ url))
      run = load().then((module) => (module as { default: Run }).default)
      loaded.set(url, run)
    }
    return run
  }
}

/** `/behaviors/history/group/index.ts` → `/behaviors/history/group`. */
export function behaviorName(url: string): string {
  return url.replace(/\/index\.[jt]s$/, "")
}
