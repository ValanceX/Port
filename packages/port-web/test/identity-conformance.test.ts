// MESH's node-identity vectors (spec §9.10: `identity/cases.json`, C1 to C10,
// and `identity/repeat/cases.json`, C11 to C22), through the Web PORT and a
// real DOM. The vectors are hand-written render-v1 trees and what the contract
// says happens between two of them: which identities are kept, created,
// removed and moved, and which handler identifiers stay. For the Web PORT
// that is observable: a kept identity is the same DOM node after `update`, a
// created one is a new node, a removed one is disposed, the DOM's order is the
// tree's, and an event reports the handler identifier of the drawn tree.
//
// A vector is data. Where the PORT disagrees with one, the test says so and
// is marked (`knownFailures`), with the reason in Valance docs/explanation/bets/
// conformance-kit.md; a vector is never weakened to pass.
import type { RenderNode, RenderTree, TextRun } from "@valancex/mesh-runtime";
import type { WebPort, WebPrimitives } from "../src/index.js";

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { WebRealizationError, createWebPort } from "../src/index.js";

import { dom, reports } from "./support.js";
import { vectors } from "./vectors.js";

type Part = RenderNode | TextRun;

interface Side {
  readonly tree: RenderTree;
  readonly identities: Readonly<Record<string, string>>;
}

interface Vector {
  readonly name: string;
  readonly about: string;
  readonly previous?: Side;
  readonly next?: Side;
  readonly earlier?: Side;
  readonly expect: {
    readonly rejected?: true;
    readonly tree?: null;
    readonly kept?: ReadonlyArray<string>;
    readonly created?: ReadonlyArray<string>;
    readonly removed?: ReadonlyArray<string>;
    readonly moved?: ReadonlyArray<string>;
    readonly handlers?: {
      readonly same: ReadonlyArray<string>;
      readonly new: ReadonlyArray<string>;
      readonly gone: ReadonlyArray<string>;
      readonly distinctWithinEachTree: boolean;
      readonly sameAsEarlier?: ReadonlyArray<string>;
    };
  };
}

const load = (path: string): ReadonlyArray<Vector> => (JSON.parse(readFileSync(new URL(path, vectors), "utf8")) as { readonly vectors: ReadonlyArray<Vector> }).vectors;

const all = [...load("identity/cases.json"), ...load("identity/repeat/cases.json")];

/** The vectors the Web PORT does not pass, by name, with why (Valance docs/explanation/bets/conformance-kit.md). */
const knownFailures: Readonly<Record<string, string>> = {};

const parts = (part: Part): ReadonlyArray<Part> => (part.type === "text" ? [part] : [part, ...part.children.flatMap(parts)]);
const nodesOf = (tree: RenderTree): ReadonlyArray<RenderNode> => parts(tree.root).filter((part): part is RenderNode => part.type === "node");

/** Every component in the trees, realized as a div, and every event as a DOM event of its own. */
const primitivesFor = (sides: ReadonlyArray<Side>): WebPrimitives => {
  const table: Record<string, { element: string; events: Record<string, { type: string }> }> = {};

  for (const side of sides) {
    for (const node of nodesOf(side.tree)) {
      const entry = (table[node.component] ??= { element: "div", events: {} });

      for (const event of Object.keys(node.events)) {
        entry.events[event] = { type: `valance-${event}` };
      }
    }
  }

  return table;
};

/** Identity name to the drawn DOM node, for the keys of `side`. */
const drawnBy = (port: WebPort, side: Side): Map<string, Node | undefined> =>
  new Map(Object.entries(side.identities).map(([key, identity]) => [identity, port.inspect(key)]));

/** Identity to key, for a side. */
const keyOf = (side: Side): Map<string, string> => new Map(Object.entries(side.identities).map(([key, identity]) => [identity, key]));

/** `identity:event` to the handler identifier the side's tree gives it. */
const handlersOf = (side: Side): Map<string, string> => {
  const identity = side.identities;
  const out = new Map<string, string>();

  for (const node of nodesOf(side.tree)) {
    for (const [event, handler] of Object.entries(node.events)) {
      out.set(`${identity[node.key]}:${event}`, handler);
    }
  }

  return out;
};

/** The identities a vector names, with each node's text run following it. */
const withText = (names: ReadonlyArray<string>, side: Side): ReadonlyArray<string> => {
  const known = new Set(Object.values(side.identities));

  return names.flatMap((name) => (known.has(`${name}/#text`) ? [name, `${name}/#text`] : [name]));
};

/** Fires the event on the node and returns what the PORT reported. */
const fire = (window: { readonly Event: typeof Event }, node: Node, event: string, calls: ReadonlyArray<ReadonlyArray<unknown>>): ReadonlyArray<ReadonlyArray<unknown>> => {
  const before = calls.length;

  node.dispatchEvent(new window.Event(`valance-${event}`, { bubbles: false }));

  return calls.slice(before);
};

describe("MESH conformance: node identity (§9.10), 22 vectors", () => {
  it("has the 22 vectors, C1 to C22", () => {
    expect(all.map((vector) => vector.name.split("-")[0])).toEqual(Array.from({ length: 22 }, (_, index) => `C${index + 1}`));
  });

  for (const vector of all) {
    const run = knownFailures[vector.name] === undefined ? it : it.fails;
    const suffix = knownFailures[vector.name] === undefined ? "" : ` (known failure: ${knownFailures[vector.name]})`;

    if (vector.previous === undefined || vector.next === undefined) {
      // C6, C16, C17: MESH rejects the render, so there is no tree for a PORT to draw.
      // What a PORT can add is that it refuses a tree with the duplicate the vector describes.
      it(`${vector.name}: MESH gives no tree, so the PORT is given none; a tree with a repeated key is refused`, () => {
        expect(vector.expect.rejected).toBe(true);
        expect(vector.expect.tree).toBeNull();

        const reference = all.find((candidate) => candidate.name === "C11-stable-repeated")!.previous!;
        const items = nodesOf(reference.tree).filter((node) => node.component === "item");
        const { container } = dom();
        const port = createWebPort({ container, primitives: primitivesFor([reference]), report: () => {} });
        const twice: RenderTree = JSON.parse(JSON.stringify(reference.tree));
        const list = nodesOf(twice).find((node) => node.component === "list")!;
        const last = list.children[list.children.length - 1] as RenderNode;

        // One item's key given to another: the tree a MESH that did not reject would have to give.
        (list.children[0] as { key: string }).key = last.key;
        expect(items.length).toBeGreaterThan(1);
        expect(() => port.draw(twice)).toThrow(WebRealizationError);
        expect(() => port.draw(twice)).toThrowError(expect.objectContaining({ code: "duplicate-key" }));
      });

      continue;
    }

    const { previous, next, earlier } = vector as Vector & { readonly previous: Side; readonly next: Side };
    const expected = vector.expect;

    run(`${vector.name}: ${vector.about.slice(0, 80)}${suffix}`, () => {
      const { window, container } = dom();
      const { calls, report } = reports();
      const port = createWebPort({ container, primitives: primitivesFor([previous, next, ...(earlier === undefined ? [] : [earlier])]), report });

      if (earlier === undefined) {
        port.draw(previous.tree);
      } else {
        port.draw(earlier.tree);
      }

      const early = earlier === undefined ? undefined : drawnBy(port, earlier);

      if (earlier !== undefined) {
        port.update(previous.tree);
      }

      const before = drawnBy(port, previous);
      const handlersBefore = handlersOf(previous);

      port.update(next.tree);

      const after = drawnBy(port, next);
      const nextKeys = keyOf(next);
      const previousKeys = keyOf(previous);
      const handlersAfter = handlersOf(next);

      // kept: the same DOM node, still in the document.
      for (const identity of withText(expected.kept!, next)) {
        expect(before.get(identity), `${identity} was drawn`).toBeDefined();
        expect(after.get(identity), `${identity} is kept (the same DOM node)`).toBe(before.get(identity));
        expect(after.get(identity)!.isConnected, `${identity} is in the document`).toBe(true);
      }

      // created: a new DOM node, even if the identity was drawn earlier (it inherits nothing).
      for (const identity of withText(expected.created!, next)) {
        expect(after.get(identity), `${identity} is drawn`).toBeDefined();
        expect(after.get(identity), `${identity} is created, not carried over`).not.toBe(before.get(identity));

        if (early !== undefined) {
          expect(after.get(identity), `${identity} is a new node, not the earlier one`).not.toBe(early.get(identity));
        }
      }

      // removed: disposed.
      for (const identity of withText(expected.removed!, previous)) {
        expect(before.get(identity), `${identity} was drawn`).toBeDefined();
        expect(before.get(identity)!.isConnected, `${identity} is out of the document`).toBe(false);
        expect(port.inspect(previousKeys.get(identity)!), `${identity} is no longer inspectable`).toBeUndefined();
      }

      // the DOM's order is the tree's, so what moved is where the tree puts it (and a kept node was moved, not recreated: checked above).
      for (const node of nodesOf(next.tree)) {
        const element = port.inspect(node.key) as Element;

        expect(Array.from(element.childNodes), `the children of ${next.identities[node.key]}`).toEqual(node.children.map((child) => port.inspect(child.key)));
      }

      // handlers.
      const handlers = expected.handlers!;

      if (handlers.distinctWithinEachTree) {
        for (const side of [previous, next]) {
          const ids = [...handlersOf(side).values()];

          expect(new Set(ids).size, "handler identifiers are distinct within a tree").toBe(ids.length);
        }
      }

      for (const entry of handlers.same) {
        const [identity, event] = entry.split(/:(?=[^:]*$)/) as [string, string];

        expect(handlersAfter.get(entry), `${entry} has the same identifier in both trees`).toBe(handlersBefore.get(entry));
        expect(fire(window, after.get(identity)!, event, calls).map((call) => call[0]), `${entry} reports the identifier`).toEqual([handlersAfter.get(entry)]);
      }

      for (const entry of handlers.new) {
        const [identity, event] = entry.split(/:(?=[^:]*$)/) as [string, string];

        expect(handlersBefore.has(entry)).toBe(false);
        expect(fire(window, after.get(identity)!, event, calls).map((call) => call[0]), `${entry} reports its new identifier`).toEqual([handlersAfter.get(entry)]);
      }

      for (const entry of handlers.gone) {
        const [identity, event] = entry.split(/:(?=[^:]*$)/) as [string, string];

        expect(handlersAfter.has(entry)).toBe(false);
        expect(fire(window, before.get(identity)!, event, calls), `${entry} is gone: its node reports nothing`).toEqual([]);
      }

      if (handlers.sameAsEarlier !== undefined && earlier !== undefined) {
        const handlersEarlier = handlersOf(earlier);

        for (const entry of handlers.sameAsEarlier) {
          expect(handlersAfter.get(entry), `${entry} has the identifier it had earlier`).toBe(handlersEarlier.get(entry));
        }
      }

      // Sanity: the keys the vector gives are the keys of the drawn tree.
      expect(nextKeys.size).toBe(Object.keys(next.identities).length);
    });
  }
});
