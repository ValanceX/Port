/**
 * How an application's primitive components become DOM. MESH has no
 * Valance-wide primitive set: each application's manifest declares its
 * own, so the Web PORT is given their realizations. This is Web-specific
 * configuration, not a renderer interface other PORTs implement.
 *
 * Prop realizations are data, not functions, so that the same table can
 * later drive server rendering: an attribute is the same attribute in the
 * DOM and in HTML, and a value becomes it by the same rule (realize.ts).
 */

import type { BoundaryValue } from "@valancex/mesh-runtime";

/** What one primitive component becomes in the DOM. */
export interface WebPrimitive {
  /** The element's tag name, such as `"button"` or `"img"`. */
  readonly element: string;
  /** How each of the primitive's props is realized. A prop in the tree with no entry here is an error. */
  readonly props?: Readonly<Record<string, PropRealization>>;
  /**
   * How each of the primitive's events is realized: which DOM interaction
   * constitutes it. A primitive may map a DOM event type to at most one of
   * its events (MESH §9.9.1: one interaction, at most one applicable event
   * per primitive); `createWebPort` refuses a table that maps two. An event
   * in the tree with no entry here is an error.
   */
  readonly events?: Readonly<Record<string, EventRealization>>;
}

/**
 * Which DOM slot a prop goes to, and so how its value is realized there
 * (MESH §9.8.7: natively, in a slot of the value's own kind that holds it
 * exactly, or as its MESH text, in a slot that holds only text). Each kind
 * is one of those two ways; nothing else is realization.
 *
 * Text-only slots. A string is its own text; a number, boolean or `null`
 * is the node's `propText` entry, which MESH's runtime made; a list or
 * record has no text and is refused. An absent prop is omitted.
 * - `attribute`: an HTML content attribute. Absent removes it.
 * - `text-property`: a `DOMString` DOM property, such as an input's
 *   `value`. Absent leaves it at the element's own initial value.
 *
 * Native slots. The value must be of the slot's kind; any other is refused.
 * - `boolean-attribute`: an HTML boolean attribute, a boolean by presence.
 *   `true` sets it (empty value); `false` or absent removes it.
 * - `property`: a DOM property that holds a value of the kind `holds`
 *   exactly: `"boolean"` (an IDL `boolean`), `"number"` (an IDL `double`,
 *   which is binary64: never an integer or `float` property, which would
 *   truncate or round), or `"value"` (a property that keeps any JavaScript
 *   value unchanged, as a custom element's own property may; lists,
 *   records and `null` are realized natively only here). Absent leaves it
 *   at the element's own initial value.
 */
export type PropRealization =
  | { readonly kind: "attribute"; readonly name: string }
  | { readonly kind: "text-property"; readonly name: string }
  | { readonly kind: "boolean-attribute"; readonly name: string }
  | { readonly kind: "property"; readonly name: string; readonly holds: PropertyKind };

/** The kind of value a native DOM property holds exactly. */
export type PropertyKind = "boolean" | "number" | "value";

/** A DOM interaction that constitutes one of a primitive's events. */
export interface EventRealization {
  /** The DOM event type that realizes the event, such as `"click"`. */
  readonly type: string;
  /**
   * Builds the event's payload from the DOM event, as the application's
   * manifest declares it. `element` is the element of the node that
   * receives the interaction (the DOM event's own target may be inside it).
   * Omit it for an event with no payload. It must return plain data: MESH
   * validates the payload when the host dispatches.
   */
  readonly payload?: (event: Event, element: Element) => BoundaryValue;
}

/** Every primitive the Web PORT can realize, by component name. */
export type WebPrimitives = Readonly<Record<string, WebPrimitive>>;

/** A content attribute: a text-only slot. `{ kind: "attribute", name }`. */
export const attribute = (name: string): PropRealization => ({ kind: "attribute", name });

/** A `DOMString` property: a text-only slot. `{ kind: "text-property", name }`. */
export const textProperty = (name: string): PropRealization => ({ kind: "text-property", name });

/** A boolean attribute, realized natively by presence. `{ kind: "boolean-attribute", name }`. */
export const booleanAttribute = (name: string): PropRealization => ({ kind: "boolean-attribute", name });

/** A DOM property holding `holds` natively. `{ kind: "property", name, holds }`. */
export const property = (name: string, holds: PropertyKind): PropRealization => ({ kind: "property", name, holds });
