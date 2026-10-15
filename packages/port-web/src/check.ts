/**
 * The Web PORT's checks, shared by every path that realizes a tree: the
 * client's draw, update and hydrate, and the server's realizeHtml. They
 * use no DOM, so the server's validation can't be weaker than the
 * client's: a table or a tree is refused, or accepted, for the same
 * reasons everywhere.
 *
 * - `validatePrimitives`: the realization table itself
 *   (docs/superpowers/specs/2026-09-28-port-web-ssr.md §4.7).
 * - `checkTree`: a render-v1 tree against the table, realizing every prop
 *   with realize.ts, before any target is touched.
 */

import type { RenderNode, RenderTree, TextRun } from "@valancex/mesh-runtime";
import type { PropRealization, WebPrimitives } from "./primitives.js";
import type { Output } from "./realize.js";

import { WebRealizationError } from "./error.js";
import { URL_ATTRIBUTES, isUnrealizable, realizeProp } from "./realize.js";

export const own = <V>(record: Readonly<Record<string, V>> | undefined, name: string): V | undefined =>
  record !== undefined && Object.hasOwn(record, name) ? record[name] : undefined;

/** The tag of the element that shows a component the PORT has no realization for. */
export const UNKNOWN_COMPONENT_ELEMENT = "valance-unknown";

/** The attribute naming the component an unknown-component placeholder stands for. */
export const COMPONENT_ATTRIBUTE = "data-component";

// HTML's void elements (HTML Living Standard, "Void elements"): they can have
// no children. In the DOM, children appended to one are never shown, and HTML
// can't serialize them, so a node realized as one must have none.
export const VOID_ELEMENTS: ReadonlySet<string> = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

// Names both the DOM (createElement, setAttribute in an HTML document) and the
// HTML parser give back unchanged: lowercase, with no character either treats
// specially.
/** The DOM event types a `key` may filter. */
const KEY_EVENTS: ReadonlySet<string> = new Set(["keydown", "keyup"]);
const ELEMENT_NAME = /^[a-z][a-z0-9-]*$/;
const ATTRIBUTE_NAME = /^[a-z_:][a-z0-9_.:-]*$/;

// ---------------------------------------------------------------------------
// The table.

/** For each primitive, which of its events each DOM event type constitutes. */
export type Applicable = ReadonlyMap<string, ReadonlyMap<string, ReadonlyArray<string>>>;

const invalid = (component: string, reason: string): WebRealizationError =>
  new WebRealizationError("invalid-primitives", `<${component}> ${reason}`);

const isRealization = (entry: unknown): entry is PropRealization => {
  if (typeof entry !== "object" || entry === null) {
    return false;
  }

  const { kind, name, holds } = entry as { readonly kind?: unknown; readonly name?: unknown; readonly holds?: unknown };

  return typeof name === "string"
    && (kind === "attribute" || kind === "text-property" || kind === "controlled" || kind === "controlled-boolean" || kind === "boolean-attribute" || (kind === "property" && (holds === "boolean" || holds === "number" || holds === "value")));
};

/**
 * Refuses a table any path could realize ambiguously, or not at all, with
 * `invalid-primitives`, and returns its events by DOM event type.
 */
export const validatePrimitives = (primitives: WebPrimitives): Applicable => {
  const applicable = new Map<string, Map<string, ReadonlyArray<string>>>();

  for (const [component, primitive] of Object.entries(primitives)) {
    if (!ELEMENT_NAME.test(primitive.element)) {
      throw invalid(component, `is realized as the element "${primitive.element}", which isn't a lowercase element name the DOM and HTML both give back unchanged`);
    }

    const attributes = new Map<string, string>([[COMPONENT_ATTRIBUTE, "the unknown-component placeholder"]]);
    const properties = new Map<string, string>();

    for (const prop of Object.keys(primitive.props ?? {})) {
      // One source prop, one realization: an accessor could give a different
      // one on each read, so only an own data property is a mapping.
      const descriptor = Object.getOwnPropertyDescriptor(primitive.props, prop)!;

      if (!("value" in descriptor)) {
        throw invalid(component, `maps its prop \`${prop}\` with an accessor, which could give it more than one realization`);
      }

      const realization: unknown = descriptor.value;

      if (!isRealization(realization)) {
        throw invalid(component, `maps its prop \`${prop}\` to something that isn't a realization of a known kind`);
      }

      const attributeClass = realization.kind === "attribute" || realization.kind === "boolean-attribute";
      const names = attributeClass ? attributes : properties;
      const other = names.get(realization.name);

      if (attributeClass && !ATTRIBUTE_NAME.test(realization.name)) {
        throw invalid(component, `realizes its prop \`${prop}\` as the attribute "${realization.name}", which isn't a lowercase attribute name the DOM and HTML both give back unchanged`);
      }

      if (other !== undefined) {
        throw invalid(component, `realizes its prop \`${prop}\` as the ${attributeClass ? "attribute" : "property"} "${realization.name}", which ${other} already is`);
      }

      names.set(realization.name, `its prop \`${prop}\``);
    }

    // Constant attributes: the element's own, never data. A name is claimed once, whether by a prop or a constant.
    for (const name of Object.keys(primitive.attributes ?? {})) {
      const descriptor = Object.getOwnPropertyDescriptor(primitive.attributes, name)!;

      if (!("value" in descriptor) || typeof descriptor.value !== "string") {
        throw invalid(component, `gives its constant attribute "${name}" a value that isn't a string (an accessor or another type)`);
      }

      if (!ATTRIBUTE_NAME.test(name)) {
        throw invalid(component, `has the constant attribute "${name}", which isn't a lowercase attribute name the DOM and HTML both give back unchanged`);
      }

      if (name.startsWith("on") || URL_ATTRIBUTES.has(name)) {
        throw invalid(component, `has the constant attribute "${name}", which is ${name.startsWith("on") ? "an event handler" : "a URL slot"}: constants are neither code nor links (use a prop for data)`);
      }

      const other = attributes.get(name);

      if (other !== undefined) {
        throw invalid(component, `has the constant attribute "${name}", which ${other} already is`);
      }

      attributes.set(name, "one of its constant attributes");
    }

    // A DOM event type may realize several events only if no interaction can be two of them: each is made by a key, and no two are made by the same one (Enter and Escape on a field, both
    // `keydown`). An event with no key is made by every interaction of its type, so it shares the type with none.
    const byType = new Map<string, Array<string>>();

    for (const [event, realization] of Object.entries(primitive.events ?? {})) {
      if (realization.key !== undefined && (typeof realization.key !== "string" || realization.key === "" || realization.key.length > 32 || !KEY_EVENTS.has(realization.type))) {
        throw invalid(component, `gives its event \`${event}\` a key that isn't a non-empty name of at most 32 characters on a keyboard event (keydown, keyup)`);
      }

      const sharing = byType.get(realization.type) ?? [];
      const other = sharing.find((name) => {
        const key = primitive.events![name]!.key;

        return key === undefined || realization.key === undefined || key === realization.key;
      });

      if (other !== undefined) {
        throw invalid(component, `realizes both \`${other}\` and \`${event}\` as the DOM event "${realization.type}", so one interaction would have two applicable events`);
      }

      byType.set(realization.type, [...sharing, event]);
    }

    applicable.set(component, byType);
  }

  return applicable;
};

// ---------------------------------------------------------------------------
// The tree.

/** Each known node's realized props, by key. */
export type Plan = ReadonlyMap<string, ReadonlyMap<string, Output>>;

/**
 * Checks `tree` in full against a validated table, and realizes every
 * prop. Throws a `WebRealizationError` for anything it can't realize.
 */
export const checkTree = (tree: RenderTree, primitives: WebPrimitives): Plan => {
  if (tree.format !== "mesh-render" || tree.version !== 1) {
    throw new WebRealizationError("unsupported-tree", `expected a render-v1 tree (format "mesh-render", version 1), got format ${JSON.stringify(tree.format)}, version ${JSON.stringify(tree.version)}`);
  }

  const keys = new Set<string>();
  const plan = new Map<string, ReadonlyMap<string, Output>>();

  const walk = (part: RenderNode | TextRun): void => {
    if (keys.has(part.key)) {
      throw new WebRealizationError("duplicate-key", `the key ${part.key} appears twice in one tree`, part.key);
    }

    keys.add(part.key);

    if (part.type === "text") {
      return;
    }

    // A text run is a maximal run of text (MESH runtime manual), so two are
    // never siblings: nothing, in the DOM or in HTML, could keep them apart.
    part.children.forEach((child, index) => {
      if (child.type === "text" && part.children[index - 1]?.type === "text") {
        throw new WebRealizationError("unsupported-tree", `<${part.component}> has two adjacent text runs, which a render-v1 tree never has`, child.key);
      }
    });

    const primitive = own(primitives, part.component);

    // An unknown component is surfaced when drawn, not refused (contract obligation 2).
    if (primitive !== undefined) {
      const outputs = new Map<string, Output>();

      for (const name of Object.keys(part.props)) {
        const realization = own(primitive.props, name);

        if (realization === undefined) {
          throw new WebRealizationError("unrealized-prop", `<${part.component}> has no realization for its prop \`${name}\``, part.key);
        }

        const output = realizeProp(part, name, realization);

        if (isUnrealizable(output)) {
          throw new WebRealizationError(output.code, `<${part.component}>'s prop \`${name}\` ${output.reason} (its ${realization.kind} \`${realization.name}\`)`, part.key);
        }

        outputs.set(name, output);
      }

      plan.set(part.key, outputs);

      for (const name of Object.keys(part.events)) {
        if (own(primitive.events, name) === undefined) {
          throw new WebRealizationError("unrealized-event", `<${part.component}> has no realization for its event \`${name}\``, part.key);
        }
      }

      if (part.children.length > 0 && VOID_ELEMENTS.has(primitive.element)) {
        throw new WebRealizationError("unrealizable-children", `<${part.component}> has children, but is realized as <${primitive.element}>, which can't hold any`, part.key);
      }
    }

    part.children.forEach(walk);
  };

  walk(tree.root);

  return plan;
};
