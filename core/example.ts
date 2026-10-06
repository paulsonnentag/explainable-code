// An example, as written in a ```json example block of an explanation.

/** One frame: the `dom` that the behavior at `view` puts in the scope of `doc`. */
export type Frame = { doc: string; view: string }

export type Example = {
  /** Dependencies: they run, but what they put is the baseline. */
  uses: string[]
  /** The behaviors under test: the diff is what they change on top of `uses`. */
  tests: string[]
  frames: Frame[]
}

export function parseExample(text: string): Example {
  const raw = JSON.parse(text) as Partial<Example>
  const urls = (value: unknown, field: string): string[] => {
    if (value === undefined) return []
    if (!Array.isArray(value) || !value.every((url) => typeof url === "string"))
      throw new Error(`"${field}" must be a list of behavior urls`)
    return value
  }
  const frames = raw.frames ?? []
  if (!Array.isArray(frames) || !frames.every((f) => typeof f?.doc === "string" && typeof f?.view === "string"))
    throw new Error(`"frames" must be a list of { "doc": <url>, "view": <behavior url> }`)
  return { uses: urls(raw.uses, "uses"), tests: urls(raw.tests, "tests"), frames }
}
