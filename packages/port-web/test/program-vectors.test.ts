// MESH's program vectors with steps (`snippets/`, `forwarder/`, `passing/`: trees for a snapshot and for
// each `step-N.snapshot.json`, with `cases.json` relating the keys of their nodes) and the `enums/` vector's
// prop cases, through the Web PORT and a real DOM. The vectors are data: the committed render trees. What a
// renderer owes them is the keyed update: a node that keeps its key between two steps is the same DOM node,
// a node whose key is gone is disposed, a new key is a new node, the DOM's order is the tree's, a handler is
// reported by the identifier the tree gives it, and two nodes with two keys are two DOM nodes. A renderer
// does not compile or render a program, so none of this needs a MESH compiler that reads snippets.
//
// The `enums/` vector's `rejects` and `dispatches` cases are about MESH refusing a snapshot at the boundary and
// resolving an event to an intent; there is no tree for a renderer to be given and no intent for it to produce
// (it reports a handler identifier, which the identity cases above already check). They are MESH's alone and
// are counted here so that a change to them is noticed.
import type { RenderNode, RenderTree, TextRun } from "@valancex/mesh-runtime";
import type { WebPrimitives } from "../src/index.js";

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createWebPort, property } from "../src/index.js";

import { dom, reports } from "./support.js";
import { vectors } from "./vectors.js";

type Part = RenderNode | TextRun;

const read = (path: string): string => readFileSync(new URL(path, vectors), "utf8");
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;
const parts = (part: Part): ReadonlyArray<Part> => (part.type === "text" ? [part] : [part, ...part.children.flatMap(parts)]);
const nodesOf = (tree: RenderTree): ReadonlyArray<RenderNode> => parts(tree.root).filter((part): part is RenderNode => part.type === "node");

/** The trees of a program directory: its snapshot's, then each step's. */
const stepsOf = (dir: string): ReadonlyArray<RenderTree> => {
  const trees = [readJson<RenderTree>(`${dir}/expected.tree.json`)];

  for (let at = 1; existsSync(new URL(`${dir}/step-${at}.expected.tree.json`, vectors)); at += 1) {
    trees.push(readJson<RenderTree>(`${dir}/step-${at}.expected.tree.json`));
  }

  return trees;
};

/** Every component in the trees, realized as a div with each of its props as a DOM property, and every event as a DOM event of its own. */
const primitivesFor = (trees: ReadonlyArray<RenderTree>): WebPrimitives => {
  const table: Record<string, { element: string; props: Record<string, ReturnType<typeof property>>; events: Record<string, { type: string }> }> = {};

  for (const tree of trees) {
    for (const node of nodesOf(tree)) {
      const entry = (table[node.component] ??= { element: "div", props: {}, events: {} });

      for (const prop of Object.keys(node.props)) {
        entry.props[prop] = property(`x-${prop}`, "value");
      }

      for (const event of Object.keys(node.events)) {
        entry.events[event] = { type: `valance-${event}` };
      }
    }
  }

  return table;
};

/** A node by the indexes of the nodes (not text runs) on the way down from the root. */
const nodeAt = (tree: RenderTree, path: ReadonlyArray<number>): RenderNode => {
  let node = tree.root;

  for (const index of path) {
    node = node.children.filter((child): child is RenderNode => child.type === "node")[index]!;
  }

  return node;
};

interface Cases {
  readonly distinct: ReadonlyArray<{ readonly case: string; readonly step: number; readonly paths: ReadonlyArray<ReadonlyArray<number>> }>;
  readonly same: ReadonlyArray<{ readonly case: string; readonly a: Side; readonly b: Side }>;
  readonly different: ReadonlyArray<{ readonly case: string; readonly a: Side; readonly b: Side }>;
}
interface Side {
  readonly step: number;
  readonly path: ReadonlyArray<number>;
}

for (const dir of ["snippets", "forwarder", "passing"]) {
  describe(`MESH conformance: ${dir}/ (steps and keys)`, () => {
    const trees = stepsOf(dir);
    const cases = readJson<Cases>(`${dir}/cases.json`);

    it("has the steps its snapshots name, and each tree draws as the DOM of its nodes in order", () => {
      expect(trees.length).toBeGreaterThanOrEqual(3);

      for (const tree of trees) {
        const { container } = dom();
        const port = createWebPort({ container, primitives: primitivesFor(trees), report: () => {} });

        port.draw(tree);

        for (const node of nodesOf(tree)) {
          const element = port.inspect(node.key) as Element;

          expect(element, `${node.component} ${node.key} is drawn`).toBeDefined();
          expect(Array.from(element.childNodes), `the children of ${node.key}`).toEqual(node.children.map((child) => port.inspect(child.key)));
        }
      }
    });

    it("a key that stays between two steps is the same DOM node, a key that goes is disposed, a new key is a new node", () => {
      const { container } = dom();
      const port = createWebPort({ container, primitives: primitivesFor(trees), report: () => {} });

      port.draw(trees[0]!);

      for (const [index, next] of trees.slice(1).entries()) {
        const previous = trees[index]!;
        const before = new Map(nodesOf(previous).map((node) => [node.key, port.inspect(node.key)]));

        port.update(next);

        const nextKeys = new Set(nodesOf(next).map((node) => node.key));

        for (const [key, element] of before) {
          if (nextKeys.has(key)) {
            expect(port.inspect(key) === element, `${key} is kept (step ${index} to ${index + 1})`).toBe(true);
          } else {
            expect(port.inspect(key), `${key} is gone`).toBeUndefined();
            expect(element!.isConnected, `${key} is out of the document`).toBe(false);
          }
        }

        for (const node of nodesOf(next)) {
          const element = port.inspect(node.key) as Element;

          if (!before.has(node.key)) {
            expect(Array.from(before.values()).includes(element), `${node.key} is a new node`).toBe(false);
          }

          expect(Array.from(element.childNodes), `the children of ${node.key}`).toEqual(node.children.map((child) => port.inspect(child.key)));
        }
      }
    });

    it("every case of cases.json holds for the DOM it draws", () => {
      const drawn = trees.map((tree) => {
        const { container } = dom();
        const port = createWebPort({ container, primitives: primitivesFor(trees), report: () => {} });

        port.draw(tree);

        return port;
      });
      const element = (side: Side) => drawn[side.step]!.inspect(nodeAt(trees[side.step]!, side.path).key);

      for (const item of cases.distinct) {
        const elements = item.paths.map((path) => element({ step: item.step, path }));

        expect(new Set(elements).size, item.case).toBe(elements.length);
        expect(elements.every((each) => each !== undefined), item.case).toBe(true);
      }

      // `same` and `different` relate two steps: the keys say whether the DOM node is kept across the update between them.
      for (const item of cases.same) {
        expect(nodeAt(trees[item.a.step]!, item.a.path).key, item.case).toBe(nodeAt(trees[item.b.step]!, item.b.path).key);
      }

      for (const item of cases.different) {
        expect(nodeAt(trees[item.a.step]!, item.a.path).key, item.case).not.toBe(nodeAt(trees[item.b.step]!, item.b.path).key);
      }
    });

    it("an event is reported with the handler identifier the tree gives it", () => {
      const { window, container } = dom();
      const { calls, report } = reports();
      const port = createWebPort({ container, primitives: primitivesFor(trees), report });
      let checked = 0;

      port.draw(trees[0]!);

      for (const node of nodesOf(trees[0]!)) {
        for (const [event, handler] of Object.entries(node.events)) {
          const before = calls.length;

          port.inspect(node.key)!.dispatchEvent(new window.Event(`valance-${event}`, { bubbles: false }));
          expect(calls.slice(before).map((call) => call[0])).toEqual([handler]);
          checked += 1;
        }
      }

      expect(checked, "the program has a handler to check").toBeGreaterThan(0);
    });
  });
}

describe("MESH conformance: enums/ (props); rejects and dispatches are MESH's alone", () => {
  const tree = readJson<RenderTree>("enums/expected.tree.json");
  const cases = readJson<{ readonly props: ReadonlyArray<{ readonly case: string; readonly node: string; readonly prop: string; readonly value: { readonly value: unknown } | { readonly absent: true } }>; readonly rejects: ReadonlyArray<unknown>; readonly dispatches: ReadonlyArray<unknown> }>("enums/cases.json");

  for (const vector of cases.props) {
    it(`a closed-set prop reaches the renderer as its string: ${vector.case}`, () => {
      const node = nodesOf(tree).find((candidate) => candidate.key === vector.node)!;

      if ("absent" in vector.value) {
        expect(Object.hasOwn(node.props, vector.prop)).toBe(false);
      } else {
        expect(node.props[vector.prop]).toEqual(vector.value.value);
      }

      const { container } = dom();
      const primitives: WebPrimitives = { [node.component]: { element: "div", props: Object.fromEntries(Object.keys(node.props).map((name) => [name, property(`x-${name}`, "value")])) } };

      createWebPort({ container, primitives, report: () => {} }).draw({ format: "mesh-render", version: 1, root: { ...node, children: [], events: {} } });

      const drawn = container.firstChild as unknown as Record<string, unknown>;

      if ("absent" in vector.value) {
        expect(drawn[`x-${vector.prop}`]).toBeUndefined();
      } else {
        expect(drawn[`x-${vector.prop}`]).toEqual(vector.value.value);
      }
    });
  }

  it("counts the cases that are MESH's alone (a snapshot MESH refuses has no tree; an intent is MESH's to resolve)", () => {
    expect([cases.rejects.length, cases.dispatches.length]).toEqual([4, 4]);
  });
});
