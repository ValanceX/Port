/**
 * Server realization: a render-v1 tree as the HTML of its container's
 * content (docs/superpowers/specs/2026-09-28-port-web-ssr.md §4). It uses no
 * DOM. It shares the table validation and tree check (check.ts) and the
 * value realization (realize.ts) with the client, and only places their
 * outputs: every text it writes is a text run's text, a string prop's own
 * value, or MESH's `propText`, escaped so an HTML parser gives it back
 * exactly. It formats nothing.
 */

import type { RenderNode, RenderTree, TextRun } from "@valancex/mesh-runtime";
import type { WebPrimitives } from "./primitives.js";
import type { Plan } from "./check.js";

import { COMPONENT_ATTRIBUTE, UNKNOWN_COMPONENT_ELEMENT, VOID_ELEMENTS, checkTree, own, validatePrimitives } from "./check.js";
import { WebRealizationError } from "./error.js";

// Elements whose content HTML parsing doesn't give back as a tree of nodes
// and text: raw text and escapable raw text elements, `template`, the
// parser's other special cases, and foreign elements, which the parser puts
// in another namespace than the client's createElement does.
const UNSERIALIZABLE_ELEMENTS: ReadonlySet<string> = new Set([
  "script", "style", "textarea", "title", "template", "xmp", "iframe", "noembed", "noframes", "noscript", "plaintext", "svg", "math",
]);

// The parser drops one line feed right after these start tags.
const LEADING_NEWLINE_DROPPED: ReadonlySet<string> = new Set(["pre", "listing"]);

const TEXT_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\r": "&#13;" };
const ATTRIBUTE_ESCAPES: Readonly<Record<string, string>> = { ...TEXT_ESCAPES, "\"": "&quot;" };

/**
 * Escapes `text` so that parsing it back gives exactly `text`: `&`, `<`, `>`
 * (and `"` in an attribute) as named references, CR as `&#13;` (a literal
 * one would become LF), and nothing else, so C1 characters stay literal. A
 * U+0000 is refused: HTML can hold it in no form.
 */
const escape = (text: string, escapes: Readonly<Record<string, string>>, key: string): string => {
  if (text.includes("\u0000")) {
    throw new WebRealizationError("unserializable-text", "a text contains U+0000, which HTML can't hold in any form", key);
  }

  return text.replace(/[&<>"\r]/g, (character) => escapes[character] ?? character);
};

const attributesOf = (node: RenderNode, primitives: WebPrimitives, plan: Plan): string => {
  const primitive = own(primitives, node.component);
  const attributes: Array<readonly [name: string, value: string | undefined]> = [];

  if (primitive === undefined) {
    attributes.push([COMPONENT_ATTRIBUTE, node.component]);
  } else {
    for (const [name, output] of plan.get(node.key) ?? []) {
      const realization = own(primitive.props, name)!;

      switch (realization.kind) {
        case "attribute":
          if ("text" in output) {
            attributes.push([realization.name, output.text]);
          }

          break;
        case "boolean-attribute":
          if ("native" in output && output.native === true) {
            attributes.push([realization.name, undefined]);
          }

          break;
        case "property":
        case "text-property":
          if (!("absent" in output)) {
            throw new WebRealizationError("unserializable-prop", `<${node.component}>'s prop \`${name}\` is realized as the DOM property \`${realization.name}\`, which has no HTML form`, node.key);
          }
      }
    }
  }

  // Code-point order of name: deterministic, whatever the table's or the tree's order.
  attributes.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return attributes.map(([name, value]) => (value === undefined ? ` ${name}` : ` ${name}="${escape(value, ATTRIBUTE_ESCAPES, node.key)}"`)).join("");
};

/**
 * Realizes `tree` as HTML: the content of the container a client will
 * hydrate. Throws a `WebRealizationError`, and returns nothing, for any
 * tree it can't realize exactly: every refusal the client makes, and the
 * server-only ones (`unserializable-prop`, `unserializable-text`,
 * `unserializable-element`).
 */
export const realizeHtml = (tree: RenderTree, primitives: WebPrimitives): string => {
  validatePrimitives(primitives);

  const plan = checkTree(tree, primitives);

  const write = (part: RenderNode | TextRun): string => {
    if (part.type === "text") {
      // An empty run writes nothing: hydration re-creates its node.
      return escape(part.text, TEXT_ESCAPES, part.key);
    }

    const element = own(primitives, part.component)?.element ?? UNKNOWN_COMPONENT_ELEMENT;

    if (UNSERIALIZABLE_ELEMENTS.has(element)) {
      throw new WebRealizationError("unserializable-element", `<${part.component}> is realized as <${element}>, whose content HTML parsing wouldn't give back as the tree says`, part.key);
    }

    const start = `<${element}${attributesOf(part, primitives, plan)}>`;

    if (VOID_ELEMENTS.has(element)) {
      return start;
    }

    const first = part.children[0];
    const newline = LEADING_NEWLINE_DROPPED.has(element) && first?.type === "text" && first.text.startsWith("\n") ? "\n" : "";

    return `${start}${newline}${part.children.map(write).join("")}</${element}>`;
  };

  return write(tree.root);
};
