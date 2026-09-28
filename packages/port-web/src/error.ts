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
  /** Server only: a present value in a DOM property slot, which HTML can't represent. */
  | "unserializable-prop"
  /** Server only: a text or attribute value containing U+0000, which HTML can't hold. */
  | "unserializable-text"
  /** Server only: an element whose content HTML parsing wouldn't give back as the tree says (raw text, `template`, SVG, MathML). */
  | "unserializable-element";

/**
 * The Web PORT can't realize what it was given. Nothing on the page has
 * changed when this is thrown: every tree is checked before the DOM is
 * touched.
 */
export class WebRealizationError extends Error {
  override readonly name = "WebRealizationError";

  constructor(
    readonly code: WebRealizationCode,
    message: string,
    /** The key of the node the problem is at, when there is one. */
    readonly key?: string
  ) {
    super(message);
  }
}
