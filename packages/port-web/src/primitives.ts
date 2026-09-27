/**
 * How an application's primitive components become DOM. MESH has no
 * Valance-wide primitive set: each application's manifest declares its
 * own, so the Web PORT is given their realizations. This is Web-specific
 * configuration, not a renderer interface other PORTs implement.
 *
 * Prop realizations are data, not functions, so that the same table can
 * later drive server rendering: an attribute is the same attribute in the
 * DOM and in HTML.
 */

import type { BoundaryValue } from "@valancex/mesh-runtime";

/** What one primitive component becomes in the DOM. */
export interface WebPrimitive {
  /** The element's tag name, such as `"button"` or `"img"`. */
  readonly element: string;
  /** How each of the primitive's props is realized. A prop in the tree with no entry here is an error. */
  readonly props?: Readonly<Record<string, PropRealization>>;
  /** How each of the primitive's events is realized. An event in the tree with no entry here is an error. */
  readonly events?: Readonly<Record<string, EventRealization>>;
}

/**
 * A prop as an attribute.
 *
 * - `attribute`: a string value is the attribute's value, as given. An
 *   absent prop removes the attribute. Any other value is an error: it has
 *   no text MESH gave, and the PORT must not invent one.
 * - `boolean-attribute`: `true` sets the attribute (empty value), and
 *   `false` or an absent prop removes it. Any other value is an error.
 */
export type PropRealization =
  | { readonly kind: "attribute"; readonly name: string }
  | { readonly kind: "boolean-attribute"; readonly name: string };

/** An event as a DOM event on the primitive's element. */
export interface EventRealization {
  /** The DOM event type that realizes the event, such as `"click"`. */
  readonly type: string;
  /**
   * Builds the event's payload from the DOM event, as the application's
   * manifest declares it. Omit it for an event with no payload. It must
   * return plain data: MESH validates the payload when the host dispatches.
   */
  readonly payload?: (event: Event) => BoundaryValue;
}

/** Every primitive the Web PORT can realize, by component name. */
export type WebPrimitives = Readonly<Record<string, WebPrimitive>>;

/** `{ kind: "attribute", name }`. */
export const attribute = (name: string): PropRealization => ({ kind: "attribute", name });

/** `{ kind: "boolean-attribute", name }`. */
export const booleanAttribute = (name: string): PropRealization => ({ kind: "boolean-attribute", name });
