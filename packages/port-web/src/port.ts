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

import { WebRealizationError } from "./error.js";

/**
 * Receives what the user did: the drawn tree's handler identifier for the
 * event, and its payload, or no payload when the event has none. The
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

interface DrawnNode {
  readonly kind: "node";
  readonly key: string;
  readonly component: string;
  /** Undefined for a component the PORT doesn't know. */
  readonly primitive: WebPrimitive | undefined;
  readonly dom: Element;
  props: RenderNode["props"];
  /** The drawn tree's handler identifier, by event name. Listeners read it when they fire. */
  readonly handlers: Map<string, string>;
  /** The DOM listeners realizing its events, removed when it's no longer drawn. */
  readonly listeners: Array<readonly [type: string, listener: (event: Event) => void]>;
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
// Checking: every tree is checked in full before the DOM is touched.

const describe = (value: BoundaryValue): string =>
  value === null ? "null" : Array.isArray(value) ? "a list" : typeof value === "object" ? "a record" : `a ${typeof value}`;

const fits = (realization: PropRealization, value: BoundaryValue): boolean => {
  switch (realization.kind) {
    case "attribute":
      return typeof value === "string";
    case "boolean-attribute":
      return typeof value === "boolean";
  }
};

const check = (tree: RenderTree, primitives: WebPrimitives): void => {
  if (tree.format !== "mesh-render" || tree.version !== 1) {
    throw new WebRealizationError("unsupported-tree", `expected a render-v1 tree (format "mesh-render", version 1), got format ${JSON.stringify(tree.format)}, version ${JSON.stringify(tree.version)}`);
  }

  const keys = new Set<string>();

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
      for (const [name, value] of Object.entries(part.props)) {
        const realization = own(primitive.props, name);

        if (realization === undefined) {
          throw new WebRealizationError("unrealized-prop", `<${part.component}> has no realization for its prop \`${name}\``, part.key);
        }

        if (!fits(realization, value)) {
          throw new WebRealizationError("unrealizable-value", `<${part.component}>'s prop \`${name}\` is ${describe(value)}, which its ${realization.kind} \`${realization.name}\` can't hold`, part.key);
        }
      }

      for (const name of Object.keys(part.events)) {
        if (own(primitive.events, name) === undefined) {
          throw new WebRealizationError("unrealized-event", `<${part.component}> has no realization for its event \`${name}\``, part.key);
        }
      }
    }

    part.children.forEach(walk);
  };

  walk(tree.root);
};

// ---------------------------------------------------------------------------
// Realizing.

const writeProp = (element: Element, realization: PropRealization, value: BoundaryValue | undefined): void => {
  switch (realization.kind) {
    case "attribute":
      if (typeof value === "string") {
        element.setAttribute(realization.name, value);
      } else {
        element.removeAttribute(realization.name);
      }

      return;
    case "boolean-attribute":
      if (value === true) {
        element.setAttribute(realization.name, "");
      } else {
        element.removeAttribute(realization.name);
      }
  }
};

const equal = (a: BoundaryValue | undefined, b: BoundaryValue | undefined): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => equal(item, b[index]));
  }

  const ra = a as { readonly [field: string]: BoundaryValue };
  const rb = b as { readonly [field: string]: BoundaryValue };
  const fields = Object.keys(ra);

  return fields.length === Object.keys(rb).length && fields.every((field) => Object.hasOwn(rb, field) && equal(ra[field], rb[field]));
};

const sameEvents = (drawn: DrawnNode, next: RenderNode): boolean => {
  const names = Object.keys(next.events);

  return names.length === drawn.handlers.size && names.every((name) => drawn.handlers.has(name));
};

export const createWebPort = ({ container, primitives, report }: WebPortOptions): WebPort => {
  const doc = container.ownerDocument;
  let drawn: Drawn | undefined;

  /** Stops `part` and everything under it from reporting. */
  const dispose = (part: Drawn): void => {
    if (part.kind === "node") {
      for (const [type, listener] of part.listeners) {
        part.dom.removeEventListener(type, listener);
      }

      part.listeners.length = 0;
      part.children.forEach(dispose);
    }
  };

  const create = (part: RenderNode | TextRun): Drawn => {
    if (part.type === "text") {
      return { kind: "text", key: part.key, dom: doc.createTextNode(part.text), text: part.text };
    }

    const primitive = own(primitives, part.component);
    const node: DrawnNode = {
      kind: "node",
      key: part.key,
      component: part.component,
      primitive,
      dom: doc.createElement(primitive?.element ?? UNKNOWN_COMPONENT_ELEMENT),
      props: part.props,
      handlers: new Map(Object.entries(part.events)),
      listeners: [],
      children: [],
    };

    if (primitive === undefined) {
      // Shown, not dropped: its children are still realized inside it.
      node.dom.setAttribute("data-component", part.component);
    } else {
      for (const [name, value] of Object.entries(part.props)) {
        writeProp(node.dom, own(primitive.props, name)!, value);
      }

      for (const name of node.handlers.keys()) {
        const realization = own(primitive.events, name)!;

        const listener = (event: Event): void => {
          // The handler identifier is read when the event fires, so it is always the drawn tree's.
          const handler = node.handlers.get(name);

          if (handler !== undefined) {
            if (realization.payload === undefined) {
              report(handler);
            } else {
              report(handler, realization.payload(event));
            }
          }
        };

        node.dom.addEventListener(realization.type, listener);
        node.listeners.push([realization.type, listener]);
      }
    }

    node.children = part.children.map((child) => create(child));
    node.dom.append(...node.children.map((child) => child.dom));

    return node;
  };

  /** Brings `old` to `next` in place when they're the same part, or replaces it. Returns what is drawn now. */
  const patch = (old: Drawn, next: RenderNode | TextRun): Drawn => {
    if (old.kind === "text" && next.type === "text" && old.key === next.key) {
      if (old.text !== next.text) {
        old.dom.data = next.text;
        old.text = next.text;
      }

      return old;
    }

    if (old.kind === "node" && next.type === "node" && old.key === next.key && old.component === next.component && sameEvents(old, next)) {
      if (old.primitive !== undefined) {
        for (const name of new Set([...Object.keys(old.props), ...Object.keys(next.props)])) {
          const before = own(old.props, name);
          const after = own(next.props, name);

          if (!equal(before, after)) {
            writeProp(old.dom, own(old.primitive.props, name)!, after);
          }
        }
      }

      old.props = next.props;

      for (const [name, handler] of Object.entries(next.events)) {
        old.handlers.set(name, handler);
      }

      // Within one program the structure never changes. If it does anyway, a
      // key only in the new tree is new and a key only in the old one is gone.
      const children: Drawn[] = [];

      next.children.forEach((child, index) => {
        const was = old.children[index];

        if (was === undefined) {
          const created = create(child);
          old.dom.append(created.dom);
          children.push(created);
        } else {
          children.push(patch(was, child));
        }
      });

      for (const gone of old.children.slice(next.children.length)) {
        dispose(gone);
        gone.dom.remove();
      }

      old.children = children;

      return old;
    }

    const created = create(next);
    dispose(old);
    old.dom.replaceWith(created.dom);

    return created;
  };

  return {
    draw(tree) {
      check(tree, primitives);

      const root = create(tree.root);

      if (drawn !== undefined) {
        dispose(drawn);
      }

      container.replaceChildren(root.dom);
      drawn = root;
    },

    update(tree) {
      if (drawn === undefined) {
        throw new WebRealizationError("not-drawn", "update needs a drawn tree: call draw first");
      }

      check(tree, primitives);
      drawn = patch(drawn, tree.root);
    },

    unmount() {
      if (drawn !== undefined) {
        dispose(drawn);
      }

      container.replaceChildren();
      drawn = undefined;
    },
  };
};
