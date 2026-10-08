import { render } from "solid-js/web"
import { createEnvironment, createLoader, createRepo, type Runtime } from "../core"
import { App } from "./App"
import { modules } from "./hosted"
import "./styles.css"

const root = createEnvironment()
root.put("repo", createRepo())

const runtime: Runtime = { root, load: createLoader(modules) }
render(() => <App runtime={runtime} />, document.getElementById("root")!)
