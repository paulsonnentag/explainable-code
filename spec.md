# Explorable code: spec

An explanation is a markdown file that tells a story about some behaviors. Its
prose carries formulas that declare named values and embed live results —
documents, their history, behaviors running on them, views of them — in place.
Everything on the page is reactive: when a document changes, every formula
that depends on it updates.

There are two layers:

- **The language**: markdown and formulas, evaluated reactively. It knows
  nothing about behaviors, views or documents. It evaluates formulas against
  the globals the host gives it.
- **The host**: the environment. It makes `env` the global scope, gives each
  document a scope, and provides `View` and `Run`. A behavior runs only where
  a formula asks for it with `Run`.

## 1. The file

```md
# Grouped history

A [document = repo.create({ "@patchwork": { type: "markdown" }, content: "My cool document" })]
looks like this: [=View("/views/markdown/index.ts", document)]. Grouping its
history is a [grouping = Run("/behaviors/history/group/index.ts", document)]:

[=grouping]
```

For how to write a good one, see [guide.md](guide.md).

### Formulas

| Written                 | Is                                | Renders as                       |
| ----------------------- | --------------------------------- | -------------------------------- |
| `[=expr]`               | An embed                          | The value                        |
| `[name = expr]`         | A declaration                     | The name, as a chip              |
| `[name]`                | A reference to a declared name    | The name, as a chip              |
| ```` ```js = ````       | An embed, as a block              | The value                        |
| ```` ```js name = ````  | A declaration, as a block         | The name, with the code folded   |

`expr` is a JavaScript expression. The body of a block is a function body: it
`return`s its value. Both may use `await`; a formula whose source contains
`await` is compiled as an async function.

### Names

A name is a JavaScript identifier: `/^[A-Za-z_$][\w$]*$/`. It is displayed with
every `_` as a space: `grouped_history` shows as "grouped history". Prose
refers to it by the identifier, `[grouped_history]`.

- A name may be declared once. A second declaration of the same name is an
  error on both.
- `env`, `View`, `Run` and `Automerge` can't be declared.
- A declared name shadows anything of the same name further down the lookup
  (see [3. Evaluation](#3-evaluation)), `document` included.

### Parsing

The block lexer is marked's. Formulas are found by an inline extension and a
code block hook, so they work anywhere inline text does: paragraphs,
headings, list items, table cells.

An inline `[` opens a formula when it is not escaped (`\[`), is not part of an
image (`![`), and is followed by one of:

- optional whitespace and `=`, where that `=` is not the start of `==` or `=>`
  — an embed;
- an identifier, optional whitespace and `=`, under the same condition — a
  declaration;
- an identifier and `]`, where the identifier is declared somewhere in the
  file — a reference.

The formula closes at the `]` that balances it. Brackets, braces and parens
are counted; strings, template literals (including their `${…}`) and comments
are skipped, so `doc["@patchwork"]` and `a[0]` are fine inside.

A candidate followed directly by `(` or `[` is not a formula; it stays
markdown, so links and reference links keep working. Link definitions
(`[x]: url` on a line of its own) are taken by the block lexer before
formulas are looked for, so `[document]:` in a sentence is a reference. Nothing
inside code spans, other code blocks or HTML is a formula. An `[identifier]`
that isn't declared is plain text.

An inline formula may span lines, but not a blank line: the block lexer has
already ended the paragraph there. Use a block for longer code.

A fenced block is a formula when its info string is `js =` or `js <name> =`.
Any other `js` block is an ordinary code block.

## 2. Rendering

### Chips

A declaration renders as its name, styled as a chip, with a dot for its state:
pending or failed. A reference renders as the same chip.

- **Hovering** a chip highlights every chip with that name and every embed of
  the value the name holds, whether a view of it or the value itself. It shows
  nothing.
- **Clicking** a declaration's chip unfolds the name's code, with the error if
  the formula failed. Code on one line of at most 60 characters unfolds inline,
  right after the chip (`groups = grouped_history.groups`); anything longer
  unfolds below the line, as a card whose caret points up at the chip. Clicking
  again folds it. Chips have no selected state.
- **Clicking** any other chip (a reference in the prose, a caption, a url in
  data) unfolds the code at the declaration and scrolls there. Clicking it
  again folds the code; if the code is unfolded but off screen, the click
  scrolls to it instead.

A formula's code has one place on the page, where it is declared, and is
either unfolded there or not.

A block declaration renders nothing until the code is revealed (see
[Revealing the code](#revealing-the-code)); the prose refers to it.

### Values

An embed draws its value with the default renderer:

| Value                       | Drawn as                                                     |
| --------------------------- | ------------------------------------------------------------ |
| A DOM `Node`, such as a view | Mounted as is                                               |
| A value that draws itself, such as a run | What it draws (see below)                      |
| `undefined`, `null`         | Nothing at the top; `undefined`, `null` inside data          |
| A string                    | Text at the top; quoted, like JSON, inside data              |
| number, boolean             | Text                                                         |
| A 64-digit hex string       | Its first 8 digits; the whole string on hover                |
| An array or object          | Written out like JSON: brackets, quoted keys, commas         |
| A `Uint8Array`              | `<n bytes>`                                                  |
| A `Date`                    | Its local date and time                                      |
| A function                  | `ƒ name`                                                     |
| Pending                     | A spinner                                                    |
| An error                    | A red chip with the message; the stack on hover              |

Clicking an array's or object's bracket folds it to a count ("3 keys"); the
top two levels start unfolded, deeper ones only when they hold at most four
plain values. Inside data, a string that is the url of a declared document is
drawn as that name's chip.

The renderer knows nothing about views or runs: a view is a node, mounted as
is. A view draws its own frame and caption (see [Views](#6-views)), so a new
kind of view can caption itself however it likes. A value that isn't a node
can draw itself too, by having a method under
`Symbol.for("explanation/draw")` (`DRAW` in `core/render.tsx`). It is called
with the page, for chips and names, and returns what to mount. A run is drawn
this way (see [`Run`](#run)).

An embed on its own (a block) is a node, a value that draws itself, or a
declared name. A block embed of any other value is an error asking for the
value to be declared and its name embedded; a named value is drawn in a frame,
captioned with its chip. Inline embeds may be any expression.

Frames and code cards have square corners and share one border and shadow.
Hovering a name highlights every chip with that name and every element on the
page whose `data-name` is the name: a named value's frame, and any view that
marks itself so.

### Layout

A formula inside text renders inline. A paragraph that holds only embeds
(and whitespace) renders its embeds as blocks, each in a frame, in a single
row that spans the page: one embed takes the full width, several share it
equally. A declaration is always inline.

### Revealing the code

A "Show code" button at the top of the page unfolds every formula's code:
each declaration's, exactly as clicking its chip would, block declarations in
full, and every embed that isn't a bare name, on a card above its frame (or
inline, before an inline embed's value). "Hide code" folds them all. Between
the two, chips fold and unfold one at a time.

## 3. Evaluation

### Lookup

Expressions are compiled with the scope as a `with` object:

```ts
new Function("scope", `with (scope) { return (${expr}) }`)
```

The scope is a Proxy. An identifier resolves to the first of:

1. A declared name: its current value.
2. A slot visible from the explanation's scope: `env.get(identifier).value`.
   This is how `repo` resolves.
3. A host global: `env`, `View`, `Run` (see [`Run`](#run)), and `Automerge`,
   the `@automerge/automerge` module.
4. `globalThis`.

The Proxy's `has` returns true for the first three and false otherwise, so
browser globals and `typeof undeclared` behave as usual. It returns
`undefined` for `Symbol.unscopables`.

`env` is the explanation's scope behind a facade whose reads are tracked, for
keys that aren't identifiers: `env.get("data/@patchwork/type").value`. Its
`put` throws; formulas declare instead.

### Order and reactivity

Order in the file does not matter: a formula may use a name declared further
down. Every formula is a Solid memo, so it evaluates when it is first needed,
after whatever it reads, and reruns when any of that changes. Tracked reads
are: declared names, slots (including a slot not visible yet, so a formula
reruns when it appears), and `.value` reads through `env`.

Every formula is evaluated on load, embedded or not, so a declaration nobody
reads still runs — creating its document or starting its run. A `Run` in the
text is how an action happens: forking a document is a `Run` of the fork
behavior, and it happens when the page loads.

### Cycles

The Proxy keeps the names being evaluated. Reading one of them is a cycle:
the read throws an error naming the loop, `cycle: a → b → a`, which every
formula in the loop shows.

### Pending and errors

A formula is in one of three states: resolved, pending, failed.

- A formula whose value is a Promise is pending until it settles. When it
  reruns, the result of an earlier run that settles later is ignored.
- Reading a pending name throws a pending signal, so the reader is pending
  too. It reruns when the name resolves.
- Reading a failed name throws its error, so the reader fails with it.
- A formula that throws fails.

Neither state sticks: the formula reruns when what it read changes.

### Documents

A value that is a document handle (`DocBacked`, as `repo.create`, `repo.find`
and `repo.import` return), or a Promise of one, is a document. A name bound to
a document:

- reads as the document's current snapshot, a plain Automerge object, so
  `document.content` and `Automerge.getHistory(document)` work;
- changes whenever the document changes, rerunning its readers.

The runtime records each snapshot it hands out against its handle in a
WeakMap, so `View` (and anything else the host adds) can go from a snapshot
back to the live document.

Writes don't go through formulas. `Automerge.change` on a snapshot returns a
new copy and saves nothing; it is only useful on a document that is not in the
repo yet, which `repo.import(Automerge.save(…))` then adds. Editing is what
views are for.

The `Automerge` the expressions see must be the copy the repo uses, or its
functions won't recognise the repo's snapshots.

### Declarations are slots

When a declaration resolves, the host puts its value in the explanation's
scope under the name: a document as its handle, anything else as a plain
value. The slot keeps the last resolved value while the formula is pending or
failed. This is what the inspector shows; formulas themselves read the name
through step 1 of the lookup, never through the slot.

### Startup

1. Parse the file.
2. Fork the explanation's scope from the root.
3. Evaluate every formula.

Behaviors load asynchronously, so a formula that reads what a run writes —
`repo.find(recipe["@patchwork"].groupedHistory)` — may fail first, while the
link isn't there yet, and resolves when the run writes it, since it reads the
document.

A changed file is a new page: everything is evaluated from scratch.

## 4. The host

### Scopes

```
root                          repo
└─ explanation                declared names
   ├─ document <id>           data = the document
   │  ├─ view                 name
   │  └─ run                  props; the behavior attached
   │     ├─ view              name
   │     └─ run               props; another behavior attached
   ├─ document <id>           data = the document
   └─ view                    data = a plain value given to View, name
```

- **Root** is the app's. It holds `repo`.
- **Explanation** is forked from the root when the explanation opens and
  destroyed when it closes. Declarations are put here.
- **Document scopes**: one per document url, forked from the explanation the
  first time a document resolves as a formula's value or is given to `View`
  or `Run`. `data` is bound to the document's handle; nothing is attached.
  The scope lives as long as the explanation. A document only reachable
  inside another value — a link in a tree — gets no scope.
- **Run scopes**: one per run, forked from the document's scope, or from
  another run's scope when `Run` is given a run. Each prop is bound as a slot,
  and the behavior is attached. Whatever it puts is visible to everything
  below, so a run that puts `data` changes what the views and runs given it
  see. Destroyed when no formula asks for the run any more.
- **View scopes**: one per mount, forked from the scope of what it is given:
  a document's, a run's, or the explanation for anything else, with `data`
  bound to the value. If what the view shows has a declared name, `name` is
  bound to it. Destroyed with the mount.

### `repo`

The root's `repo` is `core/repo.ts`'s, held in memory: no network, no
storage. Every page load starts empty, so an explanation creates whatever it
shows and depends on no document anywhere else.

```ts
type Repo = {
  create<T>(init: T): DocBacked<T>
  find<T = unknown>(url: string): Promise<DocBacked<T>>
  /** A document from a saved binary, history included. */
  import<T>(binary: Uint8Array): DocBacked<T>
  /** A new document with the history of the one at `url`, which this repo must have handed out. */
  clone<T = unknown>(url: string): DocBacked<T>
}
```

### `View`

```ts
View(url: string, data: unknown, props?: Record<string, unknown>): Node
```

Mounts the view whose module is at `url` on `data` and returns the node it
mounted into, right away. The node shows a spinner while the module loads and
an error if it fails to load.

- If `data` is a document, a snapshot or a handle, the view runs in a view
  scope below that document's scope.
- If `data` is a run, the view runs below the run's scope, so it sees what
  the run put: given a checkout, it shows the draft's clone.
- Otherwise it runs in a view scope below the explanation, with `data` bound
  to the value.
- The view's function is called inside a Solid `createRoot`; the root is
  disposed when the mount is.

Mounts are kept per calling formula, keyed by `url`, the document's url (the
run, for a run; the value itself, for anything else) and `props` compared by
JSON, with documents compared by url. When the formula
reruns and calls `View` with the same key, it gets the same node back: the
view is not rebuilt, and it sees the change through its own reads. Mounts the
rerun didn't ask for again are disposed. Without this, a markdown editor would
be rebuilt — and lose focus — on every keystroke.

Views are loaded by the same loader as behaviors: hosted modules first, any
other url imported as is.

### `Run`

```ts
Run(behavior: string, on: unknown, props?: Record<string, unknown>): Promise<RunValue>

type RunValue = {
  behavior: string
  document: string // the url of the document it runs on
  reads: { key: string; value: unknown }[] // every key the run asked for, in order, with what it got
  puts: { key: string; value: unknown }[]
  creates: { document: string; value: unknown }[] // documents it created, with what they first held
  writes: { document: string; path: string[]; value: unknown }[]
  error?: string
}
```

Runs the behavior at `behavior` on `on`, a document or another run, in a run
scope of its own (see [Scopes](#scopes)) with each of `props` bound as a slot:
a document as its handle, anything else as is. It resolves once the behavior
has loaded and run for the first time.

Runs are kept like mounts: per calling formula, keyed by `behavior`, what it
runs on (the document's url, or the run) and `props`, with documents compared
by url. A formula that reruns and asks for the same run gets the same one
back, still running; a run nobody asks for any more is torn down.

The value is the run's record, always its latest run. The behavior is
attached through a recorder, which hands it the same environment with every
`get` and `put` noted. `repo` comes back as a repo whose `create`, `import`,
`clone` and `find` hand out recording handles, and a change through any
handle, or through a slot bound to a document, is diffed with `Automerge.diff`
into the paths it wrote. A path ends at the first list index, and a path under
another one already written is dropped, so writing `groups` records
`["groups"]` and creating `clones[url]` records `["clones", url]`. Each path
records the value there now, and a later change to the same path replaces the
entry, so writes made from the behavior's subscriptions keep the record
current. Puts unwrap recording handles, so a view editing a document a run put
isn't counted as the run's.

A run draws itself as a diff: a "read" row with a line per key read, and a
"write" row with a `+` line per put, per created document ("new document"),
and per path written. Paths in the document the behavior ran on read
`data/<path>`; created documents and other documents are drawn by name. Each
line shows the value short — documents and urls by name, strings quoted and
cut at 40 characters, lists and objects counted — and unfolds to the whole
value: a document as what it holds. The caption is the run's name, the
behavior ("drafts/overlay on") and the document.

`Run` is tracked: readers of its value rerun whenever the record changes. It
throws if `on` is neither a document nor a run.

## 5. Behaviors

```ts
export type Run = (env: Env) => Teardown | void
```

Unchanged from now: a behavior's default export runs against a scope, reads
slots, puts slots and writes documents, and returns a teardown when it
applies, nothing when it doesn't. It reruns when what it read changes.

What's new is what it doesn't do: a behavior makes no DOM, and nobody reads a
`dom` slot any more. Drawing is for views.

A behavior must check what it is looking at, and must not apply to the
documents it creates itself, so that it can run on any document without
running on its own output.

## 6. Views

```ts
export type View = (env: Env, props: Record<string, unknown>) => Node
```

A view's default export is called once per mount, inside a Solid root. It
returns the node to mount and keeps it up to date through its own
subscriptions; it may use Solid, and `onCleanup` runs when the mount is
disposed.

- `env` is the scope it runs in: `env.get("data")` is what it shows, and
  `env.get("name")` the name it was declared as, if it has one.
- It may write documents through their handles (`env.get("data").change(…)`).
- It never puts: `put` on its `env` throws.
- `props` is what the formula passed to `View`, or `{}`.

A view is chosen by url, so there's no dispatch: a view given data it can't
show draws a short message saying so.

A view draws its own frame and caption. The views here share
`views/figure.ts`, which frames the content and captions it with the name and
what it is shown as ("grouped history as history"), and marks the figure with
`data-name` so hovering the name highlights it. Its frame reads
`--frame-border` and `--frame-ring`, which the page sets on highlighted
elements.

A view draws a name with `<explanation-name name="recipe">`, or a document by
url with `<explanation-name url="automerge:…">`. Inside an explanation the
element becomes the name's chip, with the chip's hover and click; elsewhere
it is plain text. A url without a declared name is drawn as the url.

## 7. The example

### Behaviors and views

**`/behaviors/history/group/index.ts`** — groups a document's changes by time.

- Applies when: `data/@patchwork/type` is set and is not `"grouped-history"`,
  and `repo` is visible.
- Reads: `data` (it subscribes to the document), `data/@patchwork/type`,
  `data/@patchwork/groupedHistory`, `repo`.
- Writes:
  - `data/@patchwork/groupedHistory`, once, when it is missing: the url of a
    new document `{ "@patchwork": { type: "grouped-history" }, groups: [] }`,
    created in the same run.
  - That document's `groups`, whenever the grouping changes: newest first,
    each `{ additions, deletions, end, heads, start }`. A new group starts
    where two neighbouring changes are more than ten minutes apart. `start`
    and `end` are the times (seconds) of its oldest and newest change, `heads`
    the heads after its newest change. `additions` counts every insert, set,
    make and mark its changes made, `deletions` every delete. Ops under
    `@patchwork` don't count, and a change with nothing else belongs to no
    group, so writing the link doesn't make a group of its own.
- Puts: nothing.

**`/views/markdown/index.ts`** — a text editor over `data/content`.

- Reads: `data/@patchwork/type` (anything but `"markdown"` gets a message),
  `data/content`.
- Writes: `data/content`, with `updateText`, as you type.

**`/views/history/index.ts`** — a grouped history document as rows: "10
minutes ago", "1 hour ago", each with what it added and deleted (`+50 −1`).

- Reads: `data/@patchwork/type` (anything but `"grouped-history"` gets a
  message), `data/groups`. Ticks its own clock, once a minute, for the
  relative times.
- Writes: nothing.

**`/behaviors/drafts/*`** — drafts, after patchwork-base's drafts tool. A draft
is a document `{ "@patchwork": { type: "draft" }, name?, parent, drafts, clones }`
(`behaviors/drafts/types.ts`); `clones` maps a document's url to
`{ cloneUrl, clonedAt }`, the clone and the heads the document had when it was
cloned.

- **`main-draft`** gives a document its main draft. Applies when
  `data/@patchwork/type` is set and is not `"draft"`, and
  `data/@patchwork/mainDraftUrl` is missing. Reads those two, `repo` and
  `data`. Creates `{ …, isMain: true, parent: <the document>, drafts: [],
  clones: {}, draftCounter: 0 }` and writes its url to
  `data/@patchwork/mainDraftUrl`, in the same run.
- **`fork`** makes a draft. Applies when `data/@patchwork/mainDraftUrl` is set.
  Reads it, `repo` and `name`. Once it has found the main draft, it creates
  `{ …, name: <name, or "Draft <n>">, parent: <the main draft>, drafts: [],
  clones: {} }`, appends its url to the main draft's `drafts` and sets
  `draftCounter` to `n`.
- **`overlay`** checks a draft out. Applies when the `draft` slot is a draft.
  Reads `draft`, `repo` and `data`'s url. If the draft has no clone of the
  document, it clones it, writes `clones[<url>]` into the draft and puts
  `data` as the clone, all in its first run; otherwise it finds the clone and
  puts it.

### The explanations

[`explanations/grouped-history.md`](explanations/grouped-history.md). It opens
with the recipe as markdown, its grouped history, and the grouping run on the
recipe, side by side. Then it builds the history up: the recipe, written in
two sittings with `Automerge.updateText`; its history; the grouping and its
groups; the grouped history document, linked from the recipe; and the run
again, with what it read and wrote explained.

What the reader sees on load: two groups, "1 hour ago" (`+50 −1`) and "3 hours
ago" (`+49 −0`), and four changes in the history, the newest of them the link.
Typing in the editor adds a change to the history, and a "just now" group at
the top.

[`explanations/drafts.md`](explanations/drafts.md). It opens with a recipe
next to its checkout in a draft, both as markdown. Then: the recipe; the
main-draft run and the main draft; the fork run, named "Less sugar", and the
draft; the overlay run, the checkout, and the draft's `clones`. Typing in the
checkout edits the clone; the recipe stays as it was.

## 8. Code

### Layout

```
core/
  environment.ts     kept
  handle.ts          kept
  loader.ts          kept; loads any module's default export
  repo.ts            the memory repo: create, find, import, clone
  parse.ts           markdown → blocks, inline formulas, block formulas
  evaluate.ts        formulas → memos: lookup, states, cycles, documents
  render.tsx         the default renderer, chips, <explanation-name>, DRAW
  host.ts            scopes, View, Run
  record.ts          records a behavior's runs
  run.tsx            what Run returns, and its diff
  Explanation.tsx    puts it together
behaviors/history/group/index.ts
behaviors/drafts/    main-draft, fork, overlay, and the draft types
views/figure.ts      the frame and caption the views share
views/markdown/index.ts
views/history/index.ts
explanations/grouped-history.md
explanations/drafts.md
src/                 the app: navigation over /explanations/*.md
```

`src/hosted.ts` globs `/behaviors/**/index.ts`, `/views/**/index.ts` and
`/explanations/*.md`.

### Removed

`core/example.ts`, `core/ExampleView.tsx`, `core/world.ts`, `core/diff.ts`,
`core/runtime.ts`, `core/EnvironmentView.tsx`, and the
```` ```json example ```` blocks. The behaviors that only existed for the old
examples — `workspace/*`, `canvas/view`, `repo/created`, `history/list` — and
their explanations go too. `files/editor` becomes `views/markdown`.

The frontmatter, and with it attaching behaviors to every document; the
behavior view (`views/behavior`), which a run drawing itself replaces; the
sync server and IndexedDB storage; and `scripts/seed.ts`, which seeded an
essay on the sync server.

### Dependencies

`@automerge/automerge`, `@automerge/automerge-repo`, `marked`, `solid-js`. No
network or storage adapters.

## 9. Not in this spec

- An inspector for the scopes. Declarations are slots so one can be added.
- A source mode that shows formulas instead of their values.
- Views chosen by data type. `View` takes a url; dispatch can be built on top
  of it later, as a view.
