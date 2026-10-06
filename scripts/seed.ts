// Creates the example essay on the sync server and prints its url. The history
// is written with explicit change times, in bursts separated by long pauses,
// so the grouping has something to split.

import * as A from "@automerge/automerge"
import { Repo } from "@automerge/automerge-repo"
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket"

const SYNC_SERVER = "wss://sync3.automerge.org"

type Essay = { "@patchwork": { type: string }; title: string; content: string }

const day = Date.parse("2026-10-05T09:00:00") / 1000
const at = (hours: number, minutes: number) => day + hours * 3600 + minutes * 60

const edits: [number, (d: Essay) => void][] = [
  [at(0, 0), (d) => Object.assign(d, { "@patchwork": { type: "essay" }, title: "", content: "" })],
  [at(0, 1), (d) => A.updateText(d, ["title"], "Example Doc")],
  [at(0, 2), (d) => A.updateText(d, ["content"], "my doc")],
  [at(0, 4), (d) => A.updateText(d, ["content"], "my doc\n\nsome more")],
  [at(2, 30), (d) => A.updateText(d, ["content"], "my doc\n\nsome more stuff")],
  [at(2, 33), (d) => A.updateText(d, ["content"], "my doc\n\nsome more stuff\nand a second thought")],
  [at(26, 0), (d) => A.updateText(d, ["content"], "my doc\n\nsome more stuff\nand a second thought, the next day")],
]

let doc = A.init<Essay>()
for (const [time, edit] of edits) doc = A.change(doc, { time }, edit)

const repo = new Repo({ network: [new WebSocketClientAdapter(SYNC_SERVER)] })
const handle = repo.import<Essay>(A.save(doc))
console.log(handle.url)

await new Promise((resolve) => setTimeout(resolve, 5000))
await repo.shutdown()
process.exit(0)
