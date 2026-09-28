/**
 * The Web PORT: realizes MESH render trees (render-v1) as DOM inside a
 * container, keeps each key's DOM node across updates from one program,
 * and reports interactions as handler identifiers and payloads. It is the
 * Web binding of the PORT contract (docs/CONTRACT.md). It can also take
 * over server HTML for a tree (hydrate), as the SSR design specifies
 * (docs/superpowers/specs/2026-09-28-port-web-ssr.md).
 *
 * It uses no browser globals: every DOM object comes from the container's
 * own document.
 */

import type { BoundaryValue, RenderNode, RenderTree, TextRun } from "@valancex/mesh-runtime";
import type { Plan } from "./check.js";
import type { PropRealization, WebPrimitive, WebPrimitives } from "./primitives.js";
import type { Output } from "./realize.js";

import { COMPONENT_ATTRIBUTE, UNKNOWN_COMPONENT_ELEMENT, checkTree, own, validatePrimitives } from "./check.js";
import { WebRealizationError } from "./error.js";

export { UNKNOWN_COMPONENT_ELEMENT } from "./check.js";

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

/** Which kind of difference made hydration draw afresh. */
export type HydrationMismatchClass =
  /** The container doesn't hold exactly one element. */
  | "container"
  /** Another element, or no element, where a node's element should be. */
  | "element"
  /** An unknown-component placeholder standing for another component. */
  | "component"
  /** An element with more or fewer child nodes than the tree gives it. */
  | "child-count"
  /** Other text, or no text node, where a text run should be. */
  | "text"
  /** A text attribute missing, different, or not expected. */
  | "attribute"
  /** A boolean attribute present where it should be absent, or the reverse, or with a value. */
  | "boolean-attribute";

/** The first difference, in document order, between the server DOM and the tree. */
export interface HydrationMismatch {
  readonly class: HydrationMismatchClass;
  /** The key of the node or text run it is at, when there is one. */
  readonly key?: string;
  readonly expected: string;
  readonly found: string;
}

/** Whether hydration adopted the server DOM, or drew the tree afresh because of `mismatch`. */
export type HydrationResult =
  | { readonly adopted: true }
  | { readonly adopted: false; readonly mismatch: HydrationMismatch };

export interface WebPort {
  /** Draws `tree` afresh, replacing whatever was drawn: the first tree, or one from a different program. */
  draw(tree: RenderTree): void;
  /** Updates the drawn tree to `tree`, from the same program, in place. Each key keeps its DOM node. */
  update(tree: RenderTree): void;
  /**
   * Takes over the server HTML in the container, realized from `tree`'s
   * program and state, with nothing drawn yet. It verifies the whole DOM
   * against `tree` without changing it, then adopts it; on any mismatch it
   * draws `tree` afresh instead, and says why. Either way `tree` is then
   * drawn, exactly as after `draw`, and `update` follows.
   */
  hydrate(tree: RenderTree): HydrationResult;
  /** Removes what was drawn. Nothing is reported after this. */
  unmount(): void;
}

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
  /**
   * Each DOM property slot's initial value: the property's value on a fresh
   * element of the primitive's tag. A prop that becomes absent restores it.
   */
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

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

// ---------------------------------------------------------------------------
// Realizing props: writing an Output into its DOM slot. What is written was
// decided by realize.ts; this only places it.

const ABSENT: Output = { absent: true };

const slots = (element: Element): Record<string, unknown> => element as unknown as Record<string, unknown>;

const isPropertyClass = (realization: PropRealization): boolean => realization.kind === "property" || realization.kind === "text-property";

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

// ---------------------------------------------------------------------------
// Hydration's verification: what the server DOM must be, exactly, for a
// tree. Pure reads: it never changes the DOM.

/** The attributes the client writes for `node`, by name, with the mismatch class each belongs to. */
const expectedAttributes = (node: RenderNode, primitive: WebPrimitive | undefined, plan: Plan): ReadonlyArray<readonly [name: string, value: string, cls: HydrationMismatchClass]> => {
  if (primitive === undefined) {
    return [[COMPONENT_ATTRIBUTE, node.component, "component"]];
  }

  const expected: Array<readonly [string, string, HydrationMismatchClass]> = [];

  for (const [name, output] of plan.get(node.key) ?? []) {
    const realization = own(primitive.props, name)!;

    if (realization.kind === "attribute" && "text" in output) {
      expected.push([realization.name, output.text, "attribute"]);
    } else if (realization.kind === "boolean-attribute" && "native" in output && output.native === true) {
      expected.push([realization.name, "", "boolean-attribute"]);
    }
  }

  return expected.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
};

const describeNode = (found: Node | undefined): string =>
  found === undefined ? "nothing"
    : found.nodeType === ELEMENT_NODE ? `<${(found as Element).localName}>${(found as Element).namespaceURI === HTML_NAMESPACE ? "" : ` in ${(found as Element).namespaceURI ?? "no namespace"}`}`
      : found.nodeType === TEXT_NODE ? `the text "${(found as Text).data}"`
        : `a node of type ${found.nodeType}`;

/** Whether a text run has a server node: an empty one has none, since HTML can't express it. */
const serialized = (part: RenderNode | TextRun): boolean => part.type === "node" || part.text !== "";

export const createWebPort = ({ container, primitives, report }: WebPortOptions): WebPort => {
  const doc = container.ownerDocument;
  const applicable = validatePrimitives(primitives);
  const types = new Set(Array.from(applicable.values(), (byType) => [...byType.keys()]).flat());
  /** The drawn node each drawn element realizes. Only what is drawn is in it. */
  const nodeOf = new WeakMap<Node, DrawnNode>();
  /** One fresh element per tag, whose properties are the initial values of adopted elements' slots. */
  const probes = new Map<string, Element>();
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

  const record = (part: RenderNode, parent: DrawnNode | undefined, dom: Element, plan: Plan): DrawnNode => ({
    kind: "node",
    key: part.key,
    component: part.component,
    primitive: own(primitives, part.component),
    parent,
    dom,
    outputs: plan.get(part.key) ?? new Map(),
    initial: new Map(),
    handlers: new Map(Object.entries(part.events)),
    children: [],
  });

  const create = (part: RenderNode | TextRun, parent: DrawnNode | undefined, plan: Plan): Drawn => {
    if (part.type === "text") {
      return { kind: "text", key: part.key, dom: doc.createTextNode(part.text), text: part.text };
    }

    const primitive = own(primitives, part.component);
    const node = record(part, parent, doc.createElement(primitive?.element ?? UNKNOWN_COMPONENT_ELEMENT), plan);

    if (primitive === undefined) {
      // Shown, not dropped: its children are still realized inside it.
      node.dom.setAttribute(COMPONENT_ATTRIBUTE, part.component);
    } else {
      // The element is fresh, so its property slots hold their initial values.
      for (const realization of Object.values(primitive.props ?? {})) {
        if (isPropertyClass(realization)) {
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

  const drawChecked = (tree: RenderTree, plan: Plan): void => {
    const root = create(tree.root, undefined, plan);

    if (drawn !== undefined) {
      dispose(drawn);
    }

    container.replaceChildren(root.dom);
    drawn = root;
    listen(true);
  };

  // -------------------------------------------------------------------------
  // Hydration, in two phases. Verify reads the whole server DOM and changes
  // nothing; only if every node matches does adopt change anything.

  const verify = (part: RenderNode | TextRun, found: Node | undefined, plan: Plan): HydrationMismatch | undefined => {
    const mismatch = (cls: HydrationMismatchClass, expected: string, actual: string): HydrationMismatch =>
      ({ class: cls, key: part.key, expected, found: actual });

    if (part.type === "text") {
      return found !== undefined && found.nodeType === TEXT_NODE && (found as Text).data === part.text
        ? undefined
        : mismatch("text", `the text "${part.text}"`, describeNode(found));
    }

    const primitive = own(primitives, part.component);
    const tag = primitive?.element ?? UNKNOWN_COMPONENT_ELEMENT;

    if (found === undefined || found.nodeType !== ELEMENT_NODE || (found as Element).localName !== tag || (found as Element).namespaceURI !== HTML_NAMESPACE) {
      return mismatch("element", `<${tag}>`, describeNode(found));
    }

    const element = found as Element;
    const expected = expectedAttributes(part, primitive, plan);

    for (const [name, value, cls] of expected) {
      const actual = element.getAttribute(name);

      if (actual !== value) {
        return mismatch(cls, `${name}="${value}"`, actual === null ? `no ${name}` : `${name}="${actual}"`);
      }
    }

    const names = new Set(expected.map(([name]) => name));
    const extra = element.getAttributeNames().filter((name) => !names.has(name)).sort()[0];

    if (extra !== undefined) {
      const realization = Object.values(primitive?.props ?? {}).find((candidate) => candidate.name === extra && candidate.kind !== "property" && candidate.kind !== "text-property");
      const cls: HydrationMismatchClass = primitive === undefined && extra === COMPONENT_ATTRIBUTE ? "component" : realization?.kind === "boolean-attribute" ? "boolean-attribute" : "attribute";

      return mismatch(cls, `no ${extra}`, `${extra}="${element.getAttribute(extra)}"`);
    }

    const children = part.children.filter(serialized);
    const nodes = Array.from(element.childNodes);

    if (nodes.length !== children.length) {
      return mismatch("child-count", `${children.length} child nodes`, `${nodes.length}`);
    }

    for (const [index, child] of children.entries()) {
      const found = verify(child, nodes[index], plan);

      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  };

  const probe = (tag: string): Element => {
    let element = probes.get(tag);

    if (element === undefined) {
      element = doc.createElement(tag);
      probes.set(tag, element);
    }

    return element;
  };

  /** Adopts the verified `dom` as `part`: records it, fills in what HTML couldn't carry, and nothing else. */
  const adopt = (part: RenderNode, dom: Element, parent: DrawnNode | undefined, plan: Plan): DrawnNode => {
    const node = record(part, parent, dom, plan);

    if (node.primitive !== undefined) {
      const primitive = node.primitive;

      // The initial value is a fresh element's, never the adopted element's,
      // whose state the server's markup or the user may have changed.
      for (const realization of Object.values(primitive.props ?? {})) {
        if (isPropertyClass(realization)) {
          node.initial.set(realization.name, slots(probe(primitive.element))[realization.name]);
        }
      }

      // Present property values, which server HTML can't carry, are applied.
      // An absent one isn't written: PORT never wrote the slot.
      for (const [name, output] of node.outputs) {
        const realization = own(primitive.props, name)!;

        if (isPropertyClass(realization) && !("absent" in output)) {
          writeProp(node, realization, output);
        }
      }
    }

    nodeOf.set(dom, node);

    const nodes = Array.from(dom.childNodes);
    let next = 0;

    node.children = part.children.map((child): Drawn => {
      if (child.type === "text") {
        if (child.text === "") {
          // An empty text run has no server node: it is created, in its place.
          const text = doc.createTextNode("");
          dom.insertBefore(text, nodes[next] ?? null);

          return { kind: "text", key: child.key, dom: text, text: "" };
        }

        return { kind: "text", key: child.key, dom: nodes[next++] as Text, text: child.text };
      }

      return adopt(child, nodes[next++] as Element, node, plan);
    });

    return node;
  };

  return {
    draw(tree) {
      drawChecked(tree, checkTree(tree, primitives));
    },

    update(tree) {
      if (drawn === undefined) {
        throw new WebRealizationError("not-drawn", "update needs a drawn tree: call draw first");
      }

      const plan = checkTree(tree, primitives);
      drawn = patch(drawn, tree.root, undefined, plan);
    },

    hydrate(tree) {
      if (drawn !== undefined) {
        throw new WebRealizationError("already-drawn", "hydrate needs a PORT with nothing drawn: it takes over server HTML, never a drawn tree");
      }

      const plan = checkTree(tree, primitives);
      const nodes = Array.from(container.childNodes);
      const mismatch = nodes.length !== 1 || nodes[0]!.nodeType !== ELEMENT_NODE
        ? { class: "container", expected: "exactly one element", found: nodes.length === 1 ? describeNode(nodes[0]) : `${nodes.length} nodes` } as const
        : verify(tree.root, nodes[0], plan);

      if (mismatch !== undefined) {
        drawChecked(tree, plan);

        return { adopted: false, mismatch };
      }

      drawn = adopt(tree.root, nodes[0] as Element, undefined, plan);
      listen(true);

      return { adopted: true };
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
