// SSR test support (docs/superpowers/specs/2026-09-28-port-web-ssr.md §12):
// parse server HTML as a page load would, describe what a container
// realizes semantically, and check that SSR + hydrate realizes exactly what
// a fresh client draw does. HTML strings are compared only where
// determinism itself is under test.
import type { RenderTree } from "@valancex/mesh-runtime";
import type { HydrationResult, WebPrimitives } from "../src/index.js";

import { JSDOM } from "jsdom";
import { expect } from "vitest";

import { createWebPort } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { dom, reports } from "./support.js";

/** A full-document parse of server HTML inside the container, `<main>`, as a page load parses it. */
export const parse = (html: string) => {
  const { window } = new JSDOM(`<!doctype html><html><body><main>${html}</main></body></html>`);

  return { window, container: window.document.querySelector("main")! };
};

/** What a container realizes: every node's name, namespace, exact attribute set, property slots and children, and every text node's data, empty ones included. */
export type Realized =
  | { readonly text: string }
  | { readonly element: string; readonly namespace: string | null; readonly attributes: ReadonlyArray<readonly [string, string]>; readonly properties: Readonly<Record<string, unknown>>; readonly children: ReadonlyArray<Realized> }
  | { readonly other: number };

/** The property-class slot names `primitives` realizes, which `realized` reads from every element. */
export const propertySlots = (primitives: WebPrimitives): ReadonlyArray<string> =>
  [...new Set(Object.values(primitives).flatMap((primitive) => Object.values(primitive.props ?? {})
    .filter((realization) => realization.kind === "property" || realization.kind === "text-property")
    .map((realization) => realization.name)))];

export const realized = (container: Element, properties: ReadonlyArray<string> = []): ReadonlyArray<Realized> => {
  const describe = (node: Node): Realized => {
    if (node.nodeType === 3) {
      return { text: (node as Text).data };
    }

    if (node.nodeType !== 1) {
      return { other: node.nodeType };
    }

    const element = node as Element;

    return {
      element: element.localName,
      namespace: element.namespaceURI,
      attributes: Array.from(element.attributes, (attribute) => [attribute.name, attribute.value] as const).sort(([a], [b]) => (a < b ? -1 : 1)),
      properties: Object.fromEntries(properties.filter((name) => name in element).map((name) => [name, (element as unknown as Record<string, unknown>)[name]])),
      children: Array.from(element.childNodes, describe),
    };
  };

  return Array.from(container.childNodes, describe);
};

/** Draws `tree` afresh in a DOM of its own. */
export const drawn = (tree: RenderTree, primitives: WebPrimitives) => {
  const { window, container } = dom();
  const { calls, report } = reports();
  const port = createWebPort({ container, primitives, report });
  port.draw(tree);

  return { window, container, calls, port };
};

/** Realizes `html` (by default, `tree`'s own server HTML) in a fresh page, and hydrates it with `tree`. */
export const hydrated = (tree: RenderTree, primitives: WebPrimitives, html = realizeHtml(tree, primitives)) => {
  const { window, container } = parse(html);
  const server = new Set(allNodes(container));
  const { calls, report } = reports();
  const port = createWebPort({ container, primitives, report });
  const result: HydrationResult = port.hydrate(tree);

  return { window, container, calls, port, result, server, survivors: () => allNodes(container).filter((node) => server.has(node)) };
};

/** Every node under `container`, not including it. */
export const allNodes = (container: Node): ReadonlyArray<Node> => Array.from(container.childNodes).flatMap((node) => [node, ...allNodes(node)]);

/**
 * SSR + hydrate ≡ a fresh client draw: the server realizes `tree`, a page
 * parses it, the client adopts it (keeping every server node), and the
 * result realizes exactly what `draw(tree)` does.
 */
export const expectParity = (tree: RenderTree, primitives: WebPrimitives) => {
  const slots = propertySlots(primitives);
  const client = drawn(tree, primitives);
  const ssr = hydrated(tree, primitives);

  expect(ssr.result).toEqual({ adopted: true });
  expect(realized(ssr.container, slots)).toEqual(realized(client.container, slots));
  // Adopted, not rebuilt: every server node is still there.
  expect([...ssr.server].every((node) => ssr.container.contains(node))).toBe(true);

  return ssr;
};

/** The refusal code of `run`, or "realized". */
export const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return (error as { readonly code?: string }).code ?? "thrown";
  }

  return "realized";
};

/** The refusals only the server makes (§4.8): a client may realize these trees. */
export const SERVER_ONLY = ["unserializable-prop", "unserializable-text", "unserializable-element"];
