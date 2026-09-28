/**
 * The Web PORT: realizes MESH render trees as DOM, and reports what the
 * user does as handler identifiers and payloads, for the composer to
 * dispatch. See docs/CONTRACT.md for the contract it implements.
 *
 * @packageDocumentation
 */

export { createWebPort, UNKNOWN_COMPONENT_ELEMENT } from "./port.js";
export type { Report, WebPort, WebPortOptions } from "./port.js";
export { attribute, booleanAttribute, property, textProperty } from "./primitives.js";
export type { EventRealization, PropertyKind, PropRealization, WebPrimitive, WebPrimitives } from "./primitives.js";
export { WebRealizationError } from "./error.js";
export type { WebRealizationCode } from "./error.js";
