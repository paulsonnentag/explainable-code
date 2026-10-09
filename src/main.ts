import { canvas } from "@/behaviors/canvas"
import { embed } from "@/behaviors/embed/frame"
import { embedOutline } from "@/behaviors/embed/outline"
import { inspect } from "@/behaviors/inspect"
import { inspector } from "@/behaviors/inspector"
import { pen } from "@/behaviors/pen"
import { select } from "@/behaviors/select"
import { selection } from "@/behaviors/selection"
import { strokeLine } from "@/behaviors/stroke/line"
import { strokeOutline } from "@/behaviors/stroke/outline"
import { toolButton } from "@/behaviors/tool/button"
import { toolOutline } from "@/behaviors/tool/outline"
import { createEnvironment } from "@/core"
import { explainOutline } from "@/explanations/outline"
import { explainSelection } from "@/explanations/selection"
import { explainStroke } from "@/explanations/stroke"
import "./styles.css"

const TOOLS = [
  { type: "select", label: "Select" },
  { type: "pen", label: "Pen" },
  { type: "inspect", label: "Inspect" },
]

const root = createEnvironment()
root.put("data", { type: "canvas" })
root.put(
  "shapes",
  Object.fromEntries(
    TOOLS.map((tool, i) => {
      const id = crypto.randomUUID()
      return [id, { id, ...tool, x: 16, y: 16 + i * 36, width: 76, height: 28, locked: true }]
    }),
  ),
)
for (const b of [
  canvas,
  selection,
  toolButton,
  toolOutline,
  pen,
  select,
  inspect,
  strokeLine,
  strokeOutline,
  embed,
  embedOutline,
  inspector,
  explainStroke,
  explainOutline,
  explainSelection,
])
  root.attach(b)

const app = document.getElementById("root")!
root.get<Element>("dom").subscribe((dom) => app.replaceChildren(...(dom ? [dom] : [])))
