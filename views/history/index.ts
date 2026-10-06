// A grouped history as rows, newest first: when each group ended, relative to
// now ("10 minutes ago"), and what it added and deleted.

import { onCleanup } from "solid-js"
import type { Env } from "../../core"

type Group = { additions: number; deletions: number; start: number; end: number; heads: string[] }
type GroupedHistory = { "@patchwork"?: { type?: string }; groups?: Group[] }

const MINUTE = 60

export default function history(env: Env): Node {
  const data = env.get<GroupedHistory>("data")
  if (data.value?.["@patchwork"]?.type !== "grouped-history") return message("Not a grouped history")

  const list = document.createElement("div")
  const draw = () => {
    const groups = data.value?.groups ?? []
    const now = Date.now() / 1000
    list.replaceChildren(...(groups.length ? groups.map((group) => row(group, now)) : [message("No changes yet")]))
  }
  const tick = setInterval(draw, MINUTE * 1000)
  onCleanup(() => clearInterval(tick))
  onCleanup(data.subscribe(draw))
  return list
}

function row(group: Group, now: number): HTMLElement {
  const element = document.createElement("div")
  element.style.cssText =
    "display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:10px 14px;border-bottom:1px solid #f1f0ee;font-size:13.5px"
  const when = document.createElement("span")
  when.textContent = ago(now - group.end)
  const counts = document.createElement("span")
  counts.style.cssText = "display:flex;gap:8px;font:12px ui-monospace,'SF Mono',Menlo,monospace"
  counts.append(count(`+${group.additions}`, "#15803d"), count(`−${group.deletions}`, "#b91c1c"))
  element.append(when, counts)
  return element
}

function count(text: string, color: string): HTMLElement {
  const element = document.createElement("span")
  element.style.color = color
  element.textContent = text
  return element
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

/** Seconds ago, as "just now", "10 minutes ago", "3 hours ago", "yesterday". */
function ago(seconds: number): string {
  if (seconds < MINUTE) return "just now"
  if (seconds < 60 * MINUTE) return relative.format(-Math.floor(seconds / MINUTE), "minute")
  if (seconds < 24 * 60 * MINUTE) return relative.format(-Math.floor(seconds / (60 * MINUTE)), "hour")
  return relative.format(-Math.floor(seconds / (24 * 60 * MINUTE)), "day")
}

function message(text: string): HTMLElement {
  const element = document.createElement("div")
  element.style.cssText = "padding:10px 14px;color:#a8a29e;font-size:13.5px"
  element.textContent = text
  return element
}
