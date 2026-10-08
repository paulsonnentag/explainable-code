// The documents drafts are kept in, after patchwork-base's drafts tool.

/** Where a draft keeps its copy of one document: the clone, and the heads of the document it was cloned at. */
export type CloneEntry = { cloneUrl: string; clonedAt: string[] }

/**
 * A draft: no content of its own, only the clones of the documents it covers.
 * A document's main draft (`isMain`) lists its drafts and numbers the unnamed
 * ones; every other draft's `parent` is the draft it was forked off.
 */
export type DraftDoc = {
  "@patchwork": { type: "draft" }
  isMain?: boolean
  name?: string
  parent: string
  drafts: string[]
  clones: Record<string, CloneEntry>
  draftCounter?: number
}

/** A document that has drafts links its main draft. */
export type Drafted = { "@patchwork": { type: string; mainDraftUrl?: string } }
