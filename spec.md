# Explorable code: spec

An explanation is a markdown file that tells a story about some behaviors. Its
frontmatter says which behaviors run; its prose carries formulas that declare
named values and embed live results — documents, their history, views of
them — in place. Everything on the page is reactive: when a document changes,
every formula that depends on it updates.

There are two layers:

- **The language**: markdown, frontmatter and formulas, evaluated reactively.
  It knows nothing about behaviors, views or documents. It hands the
  frontmatter to a host and evaluates formulas against the globals the host
  gives it.
- **The host**: the environment. It loads the behaviors the frontmatter
  lists, makes `env` the global scope, gives each document a scope with the
  behaviors attached, and provides `View`.

## 1. The file

```md
---
behaviors:
  - /behaviors/history/group/index.ts
---

# Grouped history

A [document = repo.create({ content: "My cool document" })]
looks like this: [=View("/views/markdown/index.ts", document)]
```

For how to write a good one, see [guide.md](guide.md).

### Frontmatter

YAML between two `---` lines at the very start of the file. The language
parses it and passes the object to the host unchanged; a file without
frontmatter gets `{}`.

The host reads `behaviors`: the urls of the behaviors to attach, in order.
Any other key is ignored. A `behaviors` that is not a list of strings is an
error shown at the top of the page, and nothing is evaluated.

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
- `env`, `View` and `Automerge` can't be declared.
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
  data) unfolds the code at the declaration and scrolls there.

A formula's code has one place on the page, where it is declared, and is
either unfolded there or not.

A block declaration renders nothing until the code is revealed (see
[Revealing the code](#revealing-the-code)); the prose refers to it.

### Values

An embed draws its value with the default renderer:

| Value                       | Drawn as                                                     |
| --------------------------- | ------------------------------------------------------------ |
| A node `View` returned      | The view in its frame, captioned (see below)                 |
| Any other DOM `Node`        | Mounted as is                                                |
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

A view's caption names what it shows, as the name's chip, and the view, from
its url: `View("/views/history/index.ts", grouped_history)` is captioned
"grouped history as history".

An embed on its own (a block) is either a view or a declared name. A block
embed of any other value is an error asking for the value to be declared and
its name embedded; a named value is drawn in a frame, captioned with its chip.
Inline embeds may be any expression.

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
3. A host global: `env`, `View`, and `Automerge`, the `@automerge/automerge`
   module.
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
reads still runs — creating its document and attaching its behaviors.

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

1. Parse the file and its frontmatter.
2. Load every behavior in `behaviors`. Nothing is evaluated until all of them
   have loaded; a behavior that fails to load is an error at the top of the
   page, and the rest still run.
3. Fork the explanation's scope from the root.
4. Evaluate every formula.

When a formula resolves to a document, the host makes the document's scope
and attaches the behaviors (see [4. The host](#4-the-host)) **before** the
value reaches any reader. `attach` runs each behavior once, synchronously, so
whatever a behavior writes in its first run — such as a link to a document it
created — is already in the snapshot readers see.

A changed file is a new page: everything is evaluated from scratch.

## 4. The host

### Scopes

```
root                          repo
└─ explanation                declared names
   ├─ document <id>           data = the document
   ├─ document <id>           data = the document
   └─ view <n>                data = a plain value given to View
```

- **Root** is the app's. It holds `repo`.
- **Explanation** is forked from the root when the explanation opens and
  destroyed when it closes. Declarations are put here.
- **Document scopes**: one per document url, forked from the explanation the
  first time a document resolves as a formula's value or is given to `View`.
  `data` is bound to the document's handle, and every behavior in the
  frontmatter is attached, in order. The scope lives as long as the
  explanation. A document only reachable inside another value — a link in a
  tree — gets no scope.
- **View scopes**: one per mount of a view on data that isn't a document. `data`
  is bound to the value. Destroyed with the mount.

### `repo`

The root's `repo` is `core/repo.ts`'s:

```ts
type Repo = {
  create<T>(init: T): DocBacked<T>
  find<T = unknown>(url: string): Promise<DocBacked<T>>
  /** A document from a saved binary, history included. */
  import<T>(binary: Uint8Array): DocBacked<T>
}
```

`import` is new. `clone` and the memory repo go.

### `View`

```ts
View(url: string, data: unknown, props?: Record<string, unknown>): Node
```

Mounts the view whose module is at `url` on `data` and returns the node it
mounted into, right away. The node shows a spinner while the module loads and
an error if it fails to load.

- If `data` is a document, a snapshot or a handle, the view runs in that
  document's scope.
- Otherwise it runs in a new view scope with `data` bound to the value.
- The view's function is called inside a Solid `createRoot`; the root is
  disposed when the mount is.

Mounts are kept per calling formula, keyed by `url`, the document's url (or the
value itself, for anything else) and `props` compared by JSON. When the formula
reruns and calls `View` with the same key, it gets the same node back: the
view is not rebuilt, and it sees the change through its own reads. Mounts the
rerun didn't ask for again are disposed. Without this, a markdown editor would
be rebuilt — and lose focus — on every keystroke.

Views are loaded by the same loader as behaviors: hosted modules first, any
other url imported as is.

## 5. Behaviors

```ts
export type Run = (env: Env) => Teardown | void
```

Unchanged from now: a behavior's default export runs against a scope, reads
slots, puts slots and writes documents, and returns a teardown when it
applies, nothing when it doesn't. It reruns when what it read changes.

What's new is what it doesn't do: a behavior makes no DOM, and nobody reads a
`dom` slot any more. Drawing is for views.

A behavior attached to every document must check what it is looking at, and
must not apply to the documents it creates itself — otherwise it runs on its
own output.

## 6. Views

```ts
export type View = (env: Env, props: Record<string, unknown>) => Node
```

A view's default export is called once per mount, inside a Solid root. It
returns the node to mount and keeps it up to date through its own
subscriptions; it may use Solid, and `onCleanup` runs when the mount is
disposed.

- `env` is the scope it runs in: `env.get("data")` is what it shows.
- It may write documents through their handles (`env.get("data").change(…)`).
- It never puts: `put` on its `env` throws.
- `props` is what the formula passed to `View`, or `{}`.

A view is chosen by url, so there's no dispatch: a view given data it can't
show draws a short message saying so.

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

### The explanation

[`explanations/grouped-history.md`](explanations/grouped-history.md). It opens
with the recipe as markdown next to its grouped history, then builds the history up: the
recipe, written in two sittings with `Automerge.updateText`; its history; the
groups; and the grouped history document, linked from the recipe.

What the reader sees on load: two groups, "1 hour ago" (`+50 −1`) and "3 hours
ago" (`+49 −0`), and four changes in the history, the newest of them the link.
Typing in the editor adds a change to the history, and a "just now" group at
the top.

## 8. Code

### Layout

```
core/
  environment.ts     kept
  handle.ts          kept
  loader.ts          kept; loads any module's default export
  repo.ts            create, find, import
  frontmatter.ts     splits and parses the frontmatter
  parse.ts           markdown → blocks, inline formulas, block formulas
  evaluate.ts        formulas → memos: lookup, states, cycles, documents
  render.tsx         the default renderer, chips, layout
  host.ts            scopes, behaviors, View
  Explanation.tsx    puts it together
behaviors/history/group/index.ts
views/markdown/index.ts
views/history/index.ts
explanations/grouped-history.md
src/                 the app: navigation over /explanations/*.md
```

`src/hosted.ts` globs `/behaviors/**/index.ts`, `/views/**/index.ts` and
`/explanations/*.md`.

### Removed

`core/example.ts`, `core/ExampleView.tsx`, `core/world.ts`, `core/diff.ts`,
`core/runtime.ts`, `core/EnvironmentView.tsx`, the memory repo, and the
```` ```json example ```` blocks. The behaviors that only existed for the old
examples — `workspace/*`, `canvas/view`, `repo/created`, `history/list` — and
their explanations go too. `files/editor` becomes `views/markdown`.

### Dependencies

`yaml`, for the frontmatter. Everything else is already there.

## 9. Not in this spec

- An inspector for the scopes. Declarations are slots so one can be added.
- A source mode that shows formulas instead of their values.
- Views chosen by data type. `View` takes a url; dispatch can be built on top
  of it later, as a view.
