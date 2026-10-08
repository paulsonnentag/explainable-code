# Drafts

[=View("/views/markdown/index.ts", recipe)] [=View("/views/markdown/index.ts", checkout)]

A draft is a separate line of edits to a document. What is written in a draft
stays out of the document, so a change can be tried out without anyone else
seeing it half done. The [recipe] and its [checkout] in a draft are two
documents: an edit to one doesn't show up in the other.

## A document

Take a [recipe] for pancakes:

```js recipe =
return repo.create({
  "@patchwork": { type: "markdown" },
  content: "# Pancakes\n\n- 2 eggs\n- 1 cup flour\n- 1 cup milk\n- 2 tbsp sugar\n",
})
```

## The main draft

A document's drafts are listed in its main draft, a document of type `draft`.
The [drafting = Run("/behaviors/drafts/main-draft/index.ts", recipe)] makes it
the first time it runs on a document:

[=drafting]

It read the recipe's `@patchwork.type`, which isn't `draft`: a draft doesn't
get drafts of its own. Then its `@patchwork.mainDraftUrl`, which wasn't there
yet, and the `repo`, the store documents are created in. So it created the
recipe's [main_draft = repo.find(recipe["@patchwork"].mainDraftUrl)] and linked
it from the recipe at `@patchwork.mainDraftUrl`:

[=main_draft]

`isMain` marks it as the main draft, and `parent` points back at the recipe.
`drafts` lists the recipe's drafts, and `draftCounter` counts them, to number
the ones made without a name. `clones` stays empty: the main draft is the
recipe itself, so it needs no copies.

## Forking

Forking makes a new draft. The
[forking = Run("/behaviors/drafts/fork/index.ts", recipe, { name: "Less sugar" })]
makes one called "Less sugar":

[=forking]

It read the recipe's `@patchwork.mainDraftUrl`, to find the main draft, and
`name`, what to call the new draft. Without a `name`, it would have been
"Draft 1", from the main draft's `draftCounter`. It created the
[draft = repo.find(main_draft.drafts[0])], then listed it in the main draft's
`drafts` and counted it in `draftCounter`:

[=draft]

The draft's `parent` is the main draft it was forked off. Its `clones` are
empty: forking copies nothing. The draft gets its copy of a document the first
time it is checked out.

## Checking out

Checking a draft out shows a document as the draft has it. The
[checkout = Run("/behaviors/drafts/overlay/index.ts", recipe, { draft })] checks
the recipe out in the [draft]:

[=checkout]

It read the draft's `clones`, which had no copy of the recipe yet, and the
`data`, the recipe. So it cloned the recipe: a new document with the recipe's
whole history. It recorded the clone in the draft's
[clones = draft.clones], under the recipe's url:

[=clones]

`cloneUrl` is the clone, and `clonedAt` the heads the recipe had when it was
cloned: the version the draft starts from. Then it put `data`, the document
everything in the checkout reads, as the clone instead of the recipe. A view of
the [checkout] shows and edits the clone, so its edits stay in the draft and the
recipe doesn't change. Checking the draft out again finds the clone in `clones`
and uses it.
