---
behaviors:
  - /behaviors/history/group/index.ts
---

# Grouped history

[=View("/views/markdown/index.ts", recipe)] [=View("/views/history/index.ts", grouped_history)]

Every edit to a document is a change, and a sentence is dozens of them, so a
history read change by change is too fine to follow. Grouped history gathers
the changes made close together in time into one entry. The history then
reads as sittings: what happened ten minutes ago, what happened this morning.

## A document and its history

Take a [recipe] written in two sittings. Three hours ago its author wrote the
title and, two minutes later, the ingredients. An hour ago they added the
steps and changed two eggs to three.

```js recipe =
const hour = 60 * 60
const now = Math.floor(Date.now() / 1000)
let doc = Automerge.init()
doc = Automerge.change(doc, { time: now - 3 * hour }, (d) => {
  d["@patchwork"] = { type: "markdown" }
  d.content = "# Pancakes\n"
})
doc = Automerge.change(doc, { time: now - 3 * hour + 120 }, (d) => {
  Automerge.updateText(d, ["content"], "# Pancakes\n\n- 2 eggs\n- 1 cup flour\n- 1 cup milk\n")
})
doc = Automerge.change(doc, { time: now - hour }, (d) => {
  Automerge.updateText(
    d,
    ["content"],
    "# Pancakes\n\n- 3 eggs\n- 1 cup flour\n- 1 cup milk\n\n1. Whisk everything together.\n2. Fry in butter.\n",
  )
})
return repo.import(Automerge.save(doc))
```

Each change is stamped with the time it was made. Together the changes are
the recipe's
[history = Automerge.getHistory(recipe).map(({ change }) => ({ hash: change.hash, time: new Date(change.time * 1000) }))],
oldest first:

[=history]

## Grouping by time

A new group starts wherever two neighbouring changes are more than ten minutes
apart. These are the recipe's [groups = grouped_history.groups], newest first:

[=groups]

Each group has the time of its first change (`start`) and of its last
(`end`), in seconds, and the `heads` after its last change: the version of the
recipe the sitting left behind. `additions` and `deletions` count what the
sitting did: every character or value written is one addition, every one
removed is one deletion. Changing two eggs to three is one of each.

The newest change in the history is not an edit. It only touches
`@patchwork`, the part of a document that describes it rather than holding its
content, so it belongs to no group. It is the link below.

## Where it's stored

The groups aren't kept in the [recipe] itself, which holds only what its
author wrote. They live in a document of their own, the recipe's
[grouped_history = repo.find(recipe["@patchwork"].groupedHistory)], and the
recipe links to it at `@patchwork.groupedHistory`:

[=recipe] [=grouped_history]

Any document with a `@patchwork.type` gets one. The grouped history is
created and linked the first time the document is seen, and its groups are
rewritten whenever the document changes. Its own type is `grouped-history`,
and a grouped history is never grouped in turn.
