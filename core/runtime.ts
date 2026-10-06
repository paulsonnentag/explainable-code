import type { Load } from "./loader"
import type { Repo } from "./repo"

/** What the app gives the core to run examples with: where documents come from, and how behavior urls load. */
export type Runtime = {
  repo: Repo
  load: Load
}
