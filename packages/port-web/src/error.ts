/** Why the Web PORT refused a tree or an operation. Match on `code`, not `message`. */
export type WebRealizationCode =
  /** The tree isn't `format: "mesh-render"`, `version: 1`. */
  | "unsupported-tree"
  /** A prop in the tree has no realization for its primitive. */
  | "unrealized-prop"
  /** An event in the tree has no realization for its primitive. */
  | "unrealized-event"
  /** A prop's value doesn't fit its realization, e.g. a number for an attribute. */
  | "unrealizable-value"
  /** A node has children, but its primitive is realized as an HTML void element, which can't hold any. */
  | "unrealizable-children"
  /** Two parts of one tree share a key. MESH guarantees this never happens. */
  | "duplicate-key"
  /** `update` was called with nothing drawn. */
  | "not-drawn";

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
