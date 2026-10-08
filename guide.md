# Writing explanations

An explanation shows how a behavior works. Someone who reads one should be
able to say what the behavior does, why, and what it leaves in the
environment, without opening its code. For the format itself, see
[spec.md](spec.md).

## Explain the concept, not the page

Prose is about the behavior and the data it works on. It is never about the
explanation: how the page is built, what the formulas do, why the example was
set up the way it was.

Don't:

> We start with a [document]. Its first edits are backdated, so there's
> something to group. Below we embed its history.

Do:

> Take a [document] written in two sittings: two edits a couple of minutes
> apart three hours ago, and one more an hour ago.

The first one talks to the reader about how the page is put together. The
second describes the document as something real, and shows why it's worth
looking at.

Words that usually give it away: "below", "here we", "let's", "this example",
"we embed", "we show", "so that there's something to".

## Nothing is unexplained

Everything the explanation adds to the environment is explained in the
prose. Go through the list and find the sentence for each item:

- **Every run**: when its behavior applies, what it read, what it wrote and
  put.
- **Every document a behavior creates**: what it holds, where it is linked
  from, and its type.
- **Every field a behavior writes and every slot it puts**: what the value
  means. If a group has `start`, `end` and `heads`, say what each one is.
- **Every rule that decides whether a behavior applies**: say which documents
  it applies to and which it skips, and why it skips them.
- **Every declared name**: what it is.
- **Every embed**: what to look at in it.
- **Anything in the data that looks odd**: say where it comes from. If the
  history has a change the reader didn't make, say what made it.

If the reader can find something on the page that the prose doesn't account
for, the explanation is missing a sentence.

## Start from the result

Open with what the behavior gives you, shown in its views, and a short
paragraph on the problem it solves. Then build it up in the order the
behavior works:

1. the data it starts from,
2. what it reads from that data,
3. what it computes,
4. where it stores the result.

Each section adds one step, so the reader always knows how they got there.

## Show the data, not only the views

A view shows the result; the data shows how it was made. Embed the values the
behavior reads and writes, such as the history, the groups and the stored
document, next to the views that draw them. A reader who sees only the views
has to take the mechanism on trust.

Show the behavior itself, too: declare its run on a document with
`Run(behavior, document)` in the sentence that introduces what it does, and
embed the run, so the reader sees what it read and what it wrote before the
prose says why. A run is the only way a behavior happens on the page, so an
action like forking is a run too, declared where the prose introduces it.
Give a run what it needs as props (`Run(fork, recipe, { name: "Less sugar" })`)
and say what each one is for.

Name every value you embed on its own: declare it in the sentence that
introduces it, then embed the name (`[groups = …]`, then `[=groups]`). The
frame is captioned with that name, and hovering the name in the prose lights
the frame up.

Show values as they are. Embed what the library or the behavior actually
returns, not a version mapped, sliced or reformatted for the page: a reader
who sees `Automerge.getHistory(recipe)` can call it themselves and get the
same thing, while `getHistory(recipe).map(…)` shows them something nothing
produces. If the raw value is hard to read, say in the prose which fields to
look at and what they mean (`time` is in seconds), and let the default
renderer fold the rest.

## Declare names where they're introduced

Declare a name in the sentence that introduces the thing, and refer to it
with `[name]` from then on. Name it after what it is (`grouped_history`), not
after how it was made (`found_doc`) or with an abbreviation (`gh`). A name
renders as words, so it should read as a noun in the sentence.

## Choose example data that tells the story

The example data is part of the explanation. Pick data that makes the
behavior visible. For grouping by time, that means edits in more than one
sitting. Then describe the data as what it is ("written in two sittings"),
not how you produced it ("backdated").

## Keep formulas small

An inline formula is one expression, reading names. Use a block only to build
example data.

Logic belongs in the behavior. If a formula computes what the behavior
computes, the explanation is reimplementing it. Read the behavior's output
instead.

## Write plainly

Short sentences, plain words, present tense. Use the reader's terms: "edits"
and "sittings" before "changes" and "groups", until you've said what the
latter are.
