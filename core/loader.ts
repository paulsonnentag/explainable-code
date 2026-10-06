// Behaviors and views are linked by url. The app hands over the modules it
// hosts (bundled, so they share its single copy of every library); any other
// url is imported as is.

export type Hosted = Record<string, () => Promise<unknown>>
/** The default export of the module at `url`. */
export type Load = <T>(url: string) => Promise<T>

export function createLoader(hosted: Hosted): Load {
  const loaded = new Map<string, Promise<unknown>>()
  return <T>(url: string) => {
    let module = loaded.get(url)
    if (!module) {
      const load = hosted[url] ?? (() => import(/* @vite-ignore */ url))
      module = load().then((module) => (module as { default: unknown }).default)
      loaded.set(url, module)
    }
    return module as Promise<T>
  }
}
