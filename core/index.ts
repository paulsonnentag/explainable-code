// The core: runs examples of behaviors and shows them. It knows nothing about
// the behaviors it runs; the app hands it a runtime (a repo and a loader).
// Behaviors only need the types.

import "./core.css"

export type { Env, Run, Teardown } from "./environment"
export type { DocBacked, Handle } from "./handle"
export type { Runtime } from "./runtime"
export { createLoader, type Hosted, type Load } from "./loader"
export { createRepo, type Repo } from "./repo"
export { Explanation } from "./Explanation"
