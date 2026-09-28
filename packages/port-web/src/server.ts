/**
 * The Web PORT's server entry, `@valancex/port-web/server`: realizes MESH
 * render trees as HTML, with no DOM at run time. It shares the realization
 * table, its validation, the tree check and value realization with the
 * client entry, and never loads the client's DOM code. See
 * docs/superpowers/specs/2026-09-28-port-web-ssr.md.
 *
 * @packageDocumentation
 */

export { realizeHtml } from "./html.js";
export { attribute, booleanAttribute, property, textProperty } from "./primitives.js";
export type { EventRealization, PropertyKind, PropRealization, WebPrimitive, WebPrimitives } from "./primitives.js";
export { WebRealizationError } from "./error.js";
export type { WebRealizationCode } from "./error.js";
