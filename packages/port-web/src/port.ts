/**
 * The Web PORT: realizes MESH render trees (render-v1) as DOM inside a
 * container, keeps each key's DOM node across updates from one program,
 * and reports interactions as handler identifiers and payloads. It is the
 * Web binding of the PORT contract (docs/CONTRACT.md).
 *
 * It uses no browser globals: every DOM object comes from the container's
 * own document.
 */

import type { BoundaryValue, RenderNode, RenderTree, TextRun } from "@valancex/mesh-runtime";
import type { PropRealization, WebPrimitive, WebPrimitives } from "./primitives.js";
import type { Output } from "./realize.js";

import { WebRealizationError } from "./error.js";
import { isUnrealizable, realizeProp } from "./realize.js";

/**
 * Receives what the user did: the drawn tree's handler identifier for the
 * binding the interaction resolved to, and its payload, or no payload when
 * the event has none. It is called at most once per interaction. The
 * composer dispatches it with the `Render` whose tree is drawn.
 */
export type Report = (handler: string, payload?: BoundaryValue) => void;

export interface WebPortOptions {
  /** The element the PORT draws into. The PORT owns its children. */
  readonly container: Element;
  /** How each of the application's primitive components is realized. */
  readonly primitives: WebPrimitives;
  readonly report: Report;
}

export interface WebPort {
  /** Draws `tree` afresh, replacing whatever was drawn: the first tree, or one from a different program. */
  draw(tree: RenderTree): void;
  /** Updates the drawn tree to `tree`, from the same program, in place. Each key keeps its DOM node. */
  update(tree: RenderTree): void;
  /** Removes what was drawn. Nothing is reported after this. */
  unmount(): void;
}

/** The tag of the element that shows a component the PORT has no realization for. */
export const UNKNOWN_COMPONENT_ELEMENT = "valance-unknown";

// ---------------------------------------------------------------------------
// What is drawn: one record per key, holding the DOM node that realizes it.
// Its `parent` links are the render tree's own structure, which event
// resolution walks.

interface DrawnNode {
  readonly kind: "node";
  readonly key: string;
  readonly component: string;
  /** Undefined for a component the PORT doesn't know. */
  readonly primitive: WebPrimitive | undefined;
  readonly parent: DrawnNode | undefined;
  readonly dom: Element;
  /** What each prop's slot holds, as realized. A prop with no entry is absent. */
  outputs: ReadonlyMap<string, Output>;
  /** Each DOM property slot's own initial value, which an absent prop leaves it at. */
  readonly initial: Map<string, unknown>;
  /** The drawn tree's handler identifier, by event name. Read when an interaction resolves. */
  handlers: ReadonlyMap<string, string>;
  children: Drawn[];
}

interface DrawnText {
  readonly kind: "text";
  readonly key: string;
  readonly dom: Text;
  text: string;
}

type Drawn = DrawnNode | DrawnText;

const own = <V>(record: Readonly<Record<string, V>> | undefined, name: string): V | undefined =>
  record !== undefined && Object.hasOwn(record, name) ? record[name] : undefined;

// ---------------------------------------------------------------------------
// The realization table's events: for each primitive, which of its events a
// DOM event type constitutes. MESH §9.9.1: one interaction constitutes at
// most one event of a primitive, so a type maps to at most one event.

type Applicable = ReadonlyMap<string, ReadonlyMap<string, string>>;

const applicableEvents = (primitives: WebPrimitives): Applicable => {
  const applicable = new Map<string, Map<string, string>>();

  for (const [component, primitive] of Object.entries(primitives)) {
    const byType = new Map<string, string>();

    for (const [event, realization] of Object.entries(primitive.events ?? {})) {
      const other = byType.get(realization.type);

      if (other !== undefined) {
        throw new WebRealizationError("invalid-primitives", `<${component}> realizes both \`${other}\` and \`${event}\` as the DOM event "${realization.type}", so one interaction would have two applicable events`);
      }

      byType.set(realization.type, event);
    }

    applicable.set(component, byType);
  }

  return applicable;
};

// ---------------------------------------------------------------------------
// Checking: every tree is checked, and every prop realized, in full before
// the DOM is touched.

// HTML's void elements (HTML Living Standard, "Void elements"): they can have
// no children. In the DOM, children appended to one are never shown, and HTML
// can't serialize them, so a node realized as one must have none.
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Each known node's realized props, by key. */
type Plan = ReadonlyMap<string, ReadonlyMap<string, Output>>;

const check = (tree: RenderTree, primitives: WebPrimitives): Plan => {
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

      if (part.children.length > 0 && VOID_ELEMENTS.has(primitive.element.toLowerCase())) {
        throw new WebRealizationError("unrealizable-children", `<${part.component}> has children, but is realized as <${primitive.element}>, which can't hold any`, part.key);
      }
    }

    part.children.forEach(walk);
  };

  walk(tree.root);

  return plan;
};

// ---------------------------------------------------------------------------
// Realizing props: writing an Output into its DOM slot. What is written was
// decided by realize.ts; this only places it.

const ABSENT: Output = { absent: true };

const slots = (element: Element): Record<string, unknown> => element as unknown as Record<string, unknown>;

const writeProp = (node: DrawnNode, realization: PropRealization, output: Output): void => {
  const element = node.dom;

  switch (realization.kind) {
    case "attribute":
      if ("text" in output) {
        element.setAttribute(realization.name, output.text);
      } else {
        element.removeAttribute(realization.name);
      }

      return;
    case "boolean-attribute":
      if ("native" in output && output.native === true) {
        element.setAttribute(realization.name, "");
      } else {
        element.removeAttribute(realization.name);
      }

      return;
    case "text-property":
    case "property":
      slots(element)[realization.name] = "text" in output ? output.text : "native" in output ? output.native : node.initial.get(realization.name);
  }
};

const equal = (a: BoundaryValue, b: BoundaryValue): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => equal(item, b[index]!));
  }

  const ra = a as { readonly [field: string]: BoundaryValue };
  const rb = b as { readonly [field: string]: BoundaryValue };
  const fields = Object.keys(ra);

  return fields.length === Object.keys(rb).length && fields.every((field) => Object.hasOwn(rb, field) && equal(ra[field]!, rb[field]!));
};

const sameOutput = (a: Output, b: Output): boolean =>
  "absent" in a ? "absent" in b : "text" in a ? "text" in b && a.text === b.text : "native" in b && equal(a.native, b.native);

export const createWebPort = ({ container, primitives, report }: WebPortOptions): WebPort => {
  const doc = container.ownerDocument;
  const applicable = applicableEvents(primitives);
  const types = new Set(Array.from(applicable.values(), (byType) => [...byType.keys()]).flat());
  /** The drawn node each drawn element realizes. Only what is drawn is in it. */
  const nodeOf = new WeakMap<Node, DrawnNode>();
  let drawn: Drawn | undefined;
  let listening = false;

  // -------------------------------------------------------------------------
  // Event resolution (MESH §9.9.2). One capture listener per DOM event type,
  // on the container, receives every interaction inside it, whether or not
  // the DOM event bubbles and whatever other listeners do to it. It finds
  // the interacted node, then walks the drawn tree (not the DOM) from it
  // towards the root, and reports the first node whose primitive has an
  // applicable event for the interaction and binds it. So one interaction
  // gives at most one report.

  const interact = (event: Event): void => {
    let at = event.target as Node | null;
    let interacted: DrawnNode | undefined;

    // The interacted node: the innermost drawn node the DOM target is in. A
    // text run's target is its text node, whose parent is its node.
    while (at !== null && at !== container && (interacted = nodeOf.get(at)) === undefined) {
      at = at.parentNode;
    }

    for (let node = interacted; node !== undefined; node = node.parent) {
      const name = applicable.get(node.component)?.get(event.type);
      const handler = name === undefined ? undefined : node.handlers.get(name);

      if (name !== undefined && handler !== undefined) {
        const build = own(node.primitive!.events, name)!.payload;

        if (build === undefined) {
          report(handler);
        } else {
          report(handler, build(event, node.dom));
        }

        return;
      }
    }
  };

  const listen = (on: boolean): void => {
    if (on !== listening) {
      for (const type of types) {
        if (on) {
          container.addEventListener(type, interact, true);
        } else {
          container.removeEventListener(type, interact, true);
        }
      }

      listening = on;
    }
  };

  // -------------------------------------------------------------------------

  /** Stops `part` and everything under it from receiving interactions. */
  const dispose = (part: Drawn): void => {
    if (part.kind === "node") {
      nodeOf.delete(part.dom);
      part.children.forEach(dispose);
    }
  };

  const create = (part: RenderNode | TextRun, parent: DrawnNode | undefined, plan: Plan): Drawn => {
    if (part.type === "text") {
      return { kind: "text", key: part.key, dom: doc.createTextNode(part.text), text: part.text };
    }

    const primitive = own(primitives, part.component);
    const node: DrawnNode = {
      kind: "node",
      key: part.key,
      component: part.component,
      primitive,
      parent,
      dom: doc.createElement(primitive?.element ?? UNKNOWN_COMPONENT_ELEMENT),
      outputs: plan.get(part.key) ?? new Map(),
      initial: new Map(),
      handlers: new Map(Object.entries(part.events)),
      children: [],
    };

    if (primitive === undefined) {
      // Shown, not dropped: its children are still realized inside it.
      node.dom.setAttribute("data-component", part.component);
    } else {
      for (const realization of Object.values(primitive.props ?? {})) {
        if (realization.kind === "property" || realization.kind === "text-property") {
          node.initial.set(realization.name, slots(node.dom)[realization.name]);
        }
      }

      for (const [name, output] of node.outputs) {
        writeProp(node, own(primitive.props, name)!, output);
      }
    }

    nodeOf.set(node.dom, node);
    node.children = part.children.map((child) => create(child, node, plan));
    node.dom.append(...node.children.map((child) => child.dom));

    return node;
  };

  /** Brings `old` to `next` in place when they're the same part, or replaces it. Returns what is drawn now. */
  const patch = (old: Drawn, next: RenderNode | TextRun, parent: DrawnNode | undefined, plan: Plan): Drawn => {
    if (old.kind === "text" && next.type === "text" && old.key === next.key) {
      if (old.text !== next.text) {
        old.dom.data = next.text;
        old.text = next.text;
      }

      return old;
    }

    if (old.kind === "node" && next.type === "node" && old.key === next.key && old.component === next.component) {
      const outputs = plan.get(next.key) ?? new Map<string, Output>();

      if (old.primitive !== undefined) {
        for (const name of new Set([...old.outputs.keys(), ...outputs.keys()])) {
          const after = outputs.get(name) ?? ABSENT;

          if (!sameOutput(old.outputs.get(name) ?? ABSENT, after)) {
            writeProp(old, own(old.primitive.props, name)!, after);
          }
        }
      }

      old.outputs = outputs;
      // Bindings are read when an interaction resolves, so the node, and its
      // DOM element, stay as they are when a binding changes.
      old.handlers = new Map(Object.entries(next.events));

      // Within one program the structure never changes. If it does anyway, a
      // key only in the new tree is new and a key only in the old one is gone.
      const children: Drawn[] = [];

      next.children.forEach((child, index) => {
        const was = old.children[index];

        if (was === undefined) {
          const created = create(child, old, plan);
          old.dom.append(created.dom);
          children.push(created);
        } else {
          children.push(patch(was, child, old, plan));
        }
      });

      for (const gone of old.children.slice(next.children.length)) {
        dispose(gone);
        gone.dom.remove();
      }

      old.children = children;

      return old;
    }

    const created = create(next, parent, plan);
    dispose(old);
    old.dom.replaceWith(created.dom);

    return created;
  };

  return {
    draw(tree) {
      const plan = check(tree, primitives);
      const root = create(tree.root, undefined, plan);

      if (drawn !== undefined) {
        dispose(drawn);
      }

      container.replaceChildren(root.dom);
      drawn = root;
      listen(true);
    },

    update(tree) {
      if (drawn === undefined) {
        throw new WebRealizationError("not-drawn", "update needs a drawn tree: call draw first");
      }

      const plan = check(tree, primitives);
      drawn = patch(drawn, tree.root, undefined, plan);
    },

    unmount() {
      listen(false);

      if (drawn !== undefined) {
        dispose(drawn);
      }

      container.replaceChildren();
      drawn = undefined;
    },
  };
};
