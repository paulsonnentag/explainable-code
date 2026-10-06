// The core: explanations, their formulas, and the environment they run in. It
// knows nothing about the behaviors and views it runs; the app hands it a
// runtime (the root scope and a loader). Behaviors and views only need the
// types.

import "./core.css"

export { createEnvironment, type Env, type Run, type Teardown } from "./environment"
export type { DocBacked, Handle } from "./handle"
export type { Props, Runtime, View } from "./host"
export { createLoader, type Hosted, type Load } from "./loader"
export { createRepo, type Repo } from "./repo"
export { Explanation } from "./Explanation"
