import { render } from "solid-js/web"
import { createLoader, createRepo, type Runtime } from "../core"
import { App } from "./App"
import { behaviors } from "./hosted"
import "./styles.css"

const runtime: Runtime = {
  repo: createRepo({ syncServer: "wss://sync3.automerge.org", storage: "explorable-code" }),
  load: createLoader(behaviors),
}
render(() => <App runtime={runtime} />, document.getElementById("root")!)
