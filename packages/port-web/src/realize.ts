/**
 * Value realization (MESH §9.8.7): what one prop value becomes in the slot
 * its realization names, before anything touches a target. It is pure data
 * in, data out, and uses no DOM, so the DOM writer and a later server
 * (HTML) writer realize a value by this one rule and can't differ.
 *
 * The Web PORT never makes a value's text. A text-only slot gets a string
 * prop's own value, or the `propText` entry MESH's runtime made for a
 * number, boolean or `null`; nothing is formatted, coerced or encoded here.
 */

import type { BoundaryValue, RenderNode } from "@valancex/mesh-runtime";
import type { WebRealizationCode } from "./error.js";
import type { PropRealization } from "./primitives.js";

/** What a slot receives: nothing (an absent prop), MESH text, or a value realized natively. */
export type Output =
  | { readonly absent: true }
  | { readonly text: string }
  | { readonly native: BoundaryValue };

/** Why a value can't be realized in its slot. */
export interface Unrealizable {
  readonly code: Extract<WebRealizationCode, "unrealizable-value" | "missing-prop-text">;
  readonly reason: string;
}

const ABSENT: Output = { absent: true };

export const kindOf = (value: BoundaryValue): string =>
  value === null ? "null" : Array.isArray(value) ? "a list" : typeof value === "object" ? "a record" : `a ${typeof value}`;

const own = <V>(record: Readonly<Record<string, V>> | undefined, name: string): V | undefined =>
  record !== undefined && Object.hasOwn(record, name) ? record[name] : undefined;

// Attributes whose value the browser follows or loads as a URL. A script scheme in one is code a link click (or a load) runs, from data the application may not have written.
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "poster", "cite", "background", "ping", "manifest", "codebase", "longdesc", "usemap"]);
const NAVIGATING_ATTRIBUTES = new Set(["href", "action", "formaction", "cite"]);

/** The scheme the browser would read from `text` as a URL: it ignores leading controls and spaces, drops tab and newlines anywhere, and compares case-insensitively. */
const schemeOf = (text: string): string | undefined => /^([a-z][a-z0-9+.-]*):/.exec(text.replace(/^[\u0000-\u0020]+/, "").replace(/[\t\n\r]/g, "").toLowerCase())?.[1];

/** Why a string cannot be written into the attribute `name`, if it cannot: a URL slot never holds a script (`javascript:`, `vbscript:`), nor a navigable `data:` document. */
const unsafeUrl = (name: string, text: string): string | undefined => {
  if (!URL_ATTRIBUTES.has(name)) {
    return undefined;
  }

  const scheme = schemeOf(text);

  return scheme === "javascript" || scheme === "vbscript" || (scheme === "data" && NAVIGATING_ATTRIBUTES.has(name))
    ? `is a \`${scheme}:\` URL, which the attribute "${name}" never holds (a URL that runs code); the application's data can't make a link run script`
    : undefined;
};

/** Realizes `node`'s prop `name` in the slot `realization` names. */
export const realizeProp = (node: RenderNode, name: string, realization: PropRealization): Output | Unrealizable => {
  if (!Object.hasOwn(node.props, name)) {
    // Absent: omitted in every slot, never a default and never `null` (§9.8.7).
    return ABSENT;
  }

  const value = node.props[name]!;

  switch (realization.kind) {
    case "attribute":
    case "controlled":
    case "text-property": {
      if (typeof value === "string") {
        const unsafe = realization.kind === "attribute" ? unsafeUrl(realization.name, value) : undefined;

        return unsafe === undefined ? { text: value } : { code: "unrealizable-value", reason: unsafe };
      }

      if (value === null || typeof value === "number" || typeof value === "boolean") {
        const text = own(node.propText, name);

        return typeof text === "string"
          ? { text }
          : { code: "missing-prop-text", reason: `is ${kindOf(value)} with no propText entry, and the PORT doesn't make MESH text` };
      }

      return { code: "unrealizable-value", reason: `is ${kindOf(value)}, which has no MESH text, so a text-only slot can't hold it` };
    }

    case "boolean-attribute":
      return typeof value === "boolean"
        ? { native: value }
        : { code: "unrealizable-value", reason: `is ${kindOf(value)}, and a boolean attribute holds only a boolean` };

    case "property":
      switch (realization.holds) {
        case "value":
          return { native: value };
        case "boolean":
        case "number":
          return typeof value === realization.holds
            ? { native: value }
            : { code: "unrealizable-value", reason: `is ${kindOf(value)}, and the property holds only a ${realization.holds}` };
      }
  }
};

export const isUnrealizable = (result: Output | Unrealizable): result is Unrealizable => "code" in result;
