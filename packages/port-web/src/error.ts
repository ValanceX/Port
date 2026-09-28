/** Why the Web PORT refused a tree or an operation. Match on `code`, not `message`. */
export type WebRealizationCode =
  /** The tree isn't `format: "mesh-render"`, `version: 1`. */
  | "unsupported-tree"
  /** A prop in the tree has no realization for its primitive. */
  | "unrealized-prop"
  /** An event in the tree has no realization for its primitive. */
  | "unrealized-event"
  /** A prop's value can't be realized in its slot: a list or record in a text-only slot, or a value of another kind in a native one. */
  | "unrealizable-value"
  /** A number, boolean or `null` prop in a text-only slot has no `propText` entry. The PORT never makes MESH text itself. */
  | "missing-prop-text"
  /** A node has children, but its primitive is realized as an HTML void element, which can't hold any. */
  | "unrealizable-children"
  /** Two parts of one tree share a key. MESH guarantees this never happens. */
  | "duplicate-key"
  /** `update` was called with nothing drawn. */
  | "not-drawn"
  /**
   * The realization table can't be realized unambiguously: a prop mapped by
   * anything but one realization of a known kind, two props realized as one
   * attribute or property, a name the DOM and HTML don't both give back
   * unchanged, or one DOM event type constituting two events of a primitive.
   */
  | "invalid-primitives"
  /** `hydrate` was called with a tree already drawn. */
  | "already-drawn"
  /**
   * During hydration's adoption, after verification succeeded, assigning a
   * DOM property threw. The server DOM may be partly adopted: PORT reports
   * the failure, and doesn't roll back or retry. Nothing is drawn. The
   * setter's own error is the `cause`.
   */
  | "adoption-failed"
  /** Server only: a present value in a DOM property slot, which HTML can't represent. */
  | "unserializable-prop"
  /** Server only: a text or attribute value containing U+0000, which HTML can't hold. */
  | "unserializable-text"
  /** Server only: an element whose content HTML parsing wouldn't give back as the tree says (raw text, `template`, SVG, MathML). */
  | "unserializable-element";

/**
 * The Web PORT can't realize what it was given. Every tree is checked
 * before the DOM is touched, so for every code but `adoption-failed`
 * nothing on the page has changed when this is thrown. `adoption-failed`
 * comes from a DOM property setter, which is outside PORT, throwing after
 * hydration's verification: PORT doesn't promise to undo what that setter
 * or the adoption before it did.
 */
export class WebRealizationError extends Error {
  override readonly name = "WebRealizationError";

  constructor(
    readonly code: WebRealizationCode,
    message: string,
    /** The key of the node the problem is at, when there is one. */
    readonly key?: string,
    /** The error that caused it, when it came from outside PORT. */
    cause?: unknown
  ) {
    super(message, cause === undefined ? undefined : { cause });
  }
}
