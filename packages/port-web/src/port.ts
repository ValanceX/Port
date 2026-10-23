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

import { COMPONENT_ATTRIBUTE, UNKNOWN_COMPONENT_ELEMENT, checkTree, elementOf, groupKeyOf, layerIsOpen, layerRoles, own, popoverMode, validatePrimitives } from "./check.js";
import { WebRealizationError } from "./error.js";
import { isUnrealizable, realizeProp } from "./realize.js";

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

/**
 * A MESH patch list (`render-patch-v1`, MESH's `schemas/render-patch-v1.schema.json`):
 * the operations that turn the drawn tree into the next one from the same
 * program. PORT reads the format, as it reads render-v1, and doesn't
 * depend on the MESH runtime to have it.
 */
export interface RenderPatches {
  readonly format: "mesh-render-patch";
  readonly version: 1;
  readonly patches: ReadonlyArray<RenderPatch>;
}

/** One operation of a patch list. */
export type RenderPatch =
  | { readonly op: "setProp"; readonly key: string; readonly prop: string; readonly value: BoundaryValue; readonly propText?: string }
  | { readonly op: "removeProp"; readonly key: string; readonly prop: string }
  | { readonly op: "setText"; readonly key: string; readonly text: string }
  | { readonly op: "insert"; readonly parent: string; readonly before?: string; readonly node: RenderNode | TextRun }
  | { readonly op: "remove"; readonly key: string }
  | { readonly op: "move"; readonly key: string; readonly before?: string }
  | { readonly op: "replace"; readonly tree: RenderTree };

export interface WebPort {
  /** Draws `tree` afresh, replacing whatever was drawn: the first tree, or one from a different program. */
  draw(tree: RenderTree): void;
  /** Updates the drawn tree to `tree`, from the same program, in place. Each key keeps its DOM node. */
  update(tree: RenderTree): void;
  /**
   * Applies `patches`, which the composer asserts were made from the render
   * whose tree is drawn (program continuity, as for `update`), in order, in
   * place: each key keeps its DOM node, and only what a patch names is
   * written. The result is exactly what `update` of the full new tree gives.
   * `insert`, `remove` and `move` act on parts by key, never by position: a
   * moved part keeps its DOM node and its state, and a removed one is
   * disposed (a key that returns is a new part). The whole list is checked
   * before the DOM is touched, with each operation seeing the effect of the
   * ones before it, so a list this PORT can't realize changes nothing; if a
   * DOM setter then throws, `patch` throws `patch-failed` and the composer
   * recovers with `draw`. A `replace` is a `draw` of its tree, and is the
   * only operation of its list.
   *
   * Returns the keys of the parts the list touched (props or text changed,
   * parts inserted, removed or moved), in order and without repeats, so a
   * devtools panel can show what a list did. It is not part of the contract:
   * nothing is promised about it beyond that.
   */
  patch(patches: RenderPatches): ReadonlyArray<string>;
  /**
   * Takes over the server HTML in the container, realized from `tree`'s
   * program and state, with nothing drawn yet. It verifies the whole DOM
   * against `tree` without changing it, then adopts it; on any mismatch it
   * draws `tree` afresh instead, and says why. Either way `tree` is then
   * drawn, exactly as after `draw`, and `update` follows.
   *
   * A mismatch can't cause partial adoption: all verification completes
   * before adoption begins. Adoption itself isn't rollbackable across DOM
   * property setters: if one throws, `hydrate` throws `adoption-failed`,
   * with nothing drawn, and neither undoes what was written nor retries.
   */
  hydrate(tree: RenderTree): HydrationResult;
  /**
   * The DOM node that realizes the drawn part `key` names, or none if no
   * such part is drawn: for devtools, to find or highlight what a MESH node
   * became. A read only; changing the node is outside what PORT keeps true,
   * and it is not part of the contract.
   */
  inspect(key: string): Node | undefined;
  /**
   * Moves keyboard focus to the part `key` names, or to the first thing inside it that can take focus (a `column` holding a field is asked to focus the field).
   * Returns whether focus is now in that part. It is a request to the platform, not state: the host calls it after the patches that drew the part are applied
   * (a form asks for its first invalid field), and nothing is promised for a key that is not drawn (false). Tier 2.
   */
  focus(key: string): boolean;
  /**
   * Removes what was drawn. Nothing is reported after this. Safe to call
   * twice or before anything was drawn. The PORT stays usable: `draw` (or
   * `hydrate`) draws a tree again, while `update` and `patch` refuse with
   * `not-drawn`. It is synchronous.
   */
  unmount(): void;
  /**
   * The same as `unmount()`, so that `using port = createWebPort(...)` unmounts
   * at the end of the block. It exists where the platform has `Symbol.dispose`
   * (the `using` statement needs that platform too); elsewhere call `unmount()`.
   */
  [Symbol.dispose](): void;
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
  /** The element that realizes the node: replaced, by a new one that takes its children, when the prop that chooses the element changes. */
  dom: Element;
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
  readonly parent: DrawnNode | undefined;
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

/** The slots whose DOM property slot has an initial value to restore: the property class, and a controlled slot (which is an attribute and a property). */
const hasPropertySlot = (realization: PropRealization): boolean => isPropertyClass(realization) || realization.kind === "controlled" || realization.kind === "controlled-boolean";

const writeProp = (node: DrawnNode, realization: PropRealization, output: Output): void => {
  const element = node.dom;

  switch (realization.kind) {
    case "attribute":
    case "controlled":
      if ("text" in output) {
        element.setAttribute(realization.name, output.text);
      } else {
        element.removeAttribute(realization.name);
      }

      return;
    case "boolean-attribute":
    case "controlled-boolean":
      if ("native" in output && output.native === true) {
        element.setAttribute(realization.name, "");
      } else {
        element.removeAttribute(realization.name);
      }

      return;
    case "element":
      return; // the element was chosen when it was made
    case "layer":
      return; // a layer's props are the PORT's: it shows, hides and places the element after the pass
    case "text-property":
    case "property":
      slots(element)[realization.name] = "text" in output ? output.text : "native" in output ? output.native : node.initial.get(realization.name);
  }
};

/**
 * A controlled slot's contract: the DOM property holds the rendered text (or the element's initial value when absent). Written only when it differs, so a field
 * that agrees is untouched; a focused field keeps its selection, clamped to the new length, because assigning a property moves the caret to the end.
 */
const reassert = (node: DrawnNode): void => {
  if (node.primitive === undefined) {
    return;
  }

  for (const [name, output] of node.outputs) {
    const realization = own(node.primitive.props, name);

    if (realization?.kind === "controlled-boolean") {
      const flag = slots(node.dom);
      const wanted = "native" in output ? output.native === true : (node.initial.get(realization.name) as boolean | undefined) ?? false;

      if (flag[realization.name] !== wanted) {
        flag[realization.name] = wanted;
      }

      continue;
    }

    if (realization?.kind !== "controlled") {
      continue;
    }

    const slot = slots(node.dom);
    const want = "text" in output ? output.text : (node.initial.get(realization.name) as string | undefined) ?? "";

    if (slot[realization.name] === want) {
      continue;
    }

    const field = node.dom as Element & { selectionStart?: number | null; selectionEnd?: number | null; setSelectionRange?: (start: number, end: number) => void };
    const focused = node.dom.ownerDocument.activeElement === node.dom;
    let start: number | null = null;
    let end: number | null = null;

    if (focused) {
      try { start = field.selectionStart ?? null; end = field.selectionEnd ?? null; } catch { /* a field with no selection (a number input) */ }
    }

    slot[realization.name] = want;

    if (focused && start !== null && end !== null && typeof field.setSelectionRange === "function") {
      try { field.setSelectionRange(Math.min(start, want.length), Math.min(end, want.length)); } catch { /* as above */ }
    }
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
const expectedAttributes = (node: RenderNode, primitive: WebPrimitive | undefined, plan: Plan, group: string | undefined): ReadonlyArray<readonly [name: string, value: string, cls: HydrationMismatchClass]> => {
  if (primitive === undefined) {
    return [[COMPONENT_ATTRIBUTE, node.component, "component"]];
  }

  const expected: Array<readonly [string, string, HydrationMismatchClass]> = Object.entries(primitive.attributes ?? {}).map(([name, value]) => [name, value, "attribute"] as const);

  // The group's attribute, as the server writes it: the group's key, before the browser makes it the mount's own.
  if (group !== undefined) {
    expected.push([primitive.group!.attribute, group, "attribute"]);
  }

  // A modal layer that is open is written open, and a popover has the mode it has (the server's side of decision I7).
  if (primitive.layer === "modal" && layerIsOpen(primitive, plan.get(node.key))) {
    expected.push(["open", "", "boolean-attribute"]);
  }

  if (primitive.layer === "popover") {
    expected.push(["popover", popoverMode(primitive, plan.get(node.key)), "attribute"]);
  }

  for (const [name, output] of plan.get(node.key) ?? []) {
    const realization = own(primitive.props, name)!;

    if (primitive.layer === "popover" && realization.kind === "attribute" && realization.name === "popover") {
      continue;
    }

    if ((realization.kind === "attribute" || realization.kind === "controlled") && "text" in output) {
      expected.push([realization.name, output.text, "attribute"]);
    } else if ((realization.kind === "boolean-attribute" || realization.kind === "controlled-boolean") && "native" in output && output.native === true) {
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

/** The drawn nodes above `node`, nearest first. */
function* ancestors(node: DrawnNode | undefined): Generator<DrawnNode> {
  for (let at = node; at !== undefined; at = at.parent) {
    yield at;
  }
}

/** How many ports a document has had: the first one's groups are named by the keys alone (as the server wrote them), every later one's are made its own. */
const mounts = new WeakMap<Document, number>();

export const createWebPort = ({ container, primitives, report }: WebPortOptions): WebPort => {
  const doc = container.ownerDocument;
  const mounted = mounts.get(doc) ?? 0;

  mounts.set(doc, mounted + 1);

  /** Prefixes the key of a group: nothing for the document's first port, and the port's own number for the others, so two mounts of one tree in one document never share a group. */
  const scope = mounted === 0 ? "" : `m${mounted}:`;
  const groupOf = (node: DrawnNode, parent: DrawnNode | undefined): void => {
    const key = groupKeyOf(node.primitive, ancestors(parent));

    if (key !== undefined) {
      node.dom.setAttribute(node.primitive!.group!.attribute, scope + key);
    }
  };
  const applicable = validatePrimitives(primitives);
  const types = new Set(Array.from(applicable.values(), (byType) => [...byType.keys()]).flat());
  /** The drawn node each drawn element realizes. Only what is drawn is in it. */
  const nodeOf = new WeakMap<Node, DrawnNode>();
  /** One fresh element per tag, whose properties are the initial values of adopted elements' slots. */
  const probes = new Map<string, Element>();
  /** The drawn part each key realizes: what a patch finds its target by. Kept in step with what is drawn. */
  const byKey = new Map<string, Drawn>();
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
    if (restoring && (event.type === "focus" || event.type === "blur" || event.type === "focusin" || event.type === "focusout")) {
      return;
    }

    let at = event.target as Node | null;
    let interacted: DrawnNode | undefined;

    // The interacted node: the innermost drawn node the DOM target is in. A
    // text run's target is its text node, whose parent is its node.
    while (at !== null && at !== container && (interacted = nodeOf.get(at)) === undefined) {
      at = at.parentNode;
    }

    for (let node = interacted; node !== undefined; node = node.parent) {
      // The events of this primitive that this interaction can be: of its DOM type, bound to a handler here, and (when the event is made by a key) made by the key pressed. At most one,
      // since the table was checked to give no two events the same interaction. Any other key is not an interaction for them, and the walk goes on toward the root.
      const name = applicable
        .get(node.component)
        ?.get(event.type)
        ?.find((candidate) => {
          const key = own(node.primitive!.events, candidate)!.key;

          return node.handlers.has(candidate) && (key === undefined || (event as KeyboardEvent).key === key);
        });
      const handler = name === undefined ? undefined : node.handlers.get(name);

      if (name !== undefined && handler !== undefined) {
        const realization = own(node.primitive!.events, name)!;
        const build = realization.payload;

        if (build === undefined) {
          report(handler);
        } else {
          report(handler, build(event, node.dom));
        }

        return;
      }
    }
  };

  /** When Escape was last pressed in the container: what tells a popover the person closed with Escape from one they clicked away from. */
  const noteEscape = (event: Event): void => {
    if ((event as KeyboardEvent).key === "Escape") {
      escapeAt = performance.now();
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

      if (on) {
        container.addEventListener("keydown", noteEscape, true);
      } else {
        container.removeEventListener("keydown", noteEscape, true);
      }

      listening = on;
    }
  };

  // -------------------------------------------------------------------------

  /** Stops `part` and everything under it from receiving interactions. */
  const dispose = (part: Drawn): void => {
    // Only if the key is still this part's: a part drawn afresh for the same key has replaced it.
    if (byKey.get(part.key) === part) {
      byKey.delete(part.key);
    }

    if (part.kind === "node") {
      nodeOf.delete(part.dom);
      forgetLayer(part);
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
      const created: DrawnText = { kind: "text", key: part.key, parent, dom: doc.createTextNode(part.text), text: part.text };
      byKey.set(part.key, created);

      return created;
    }

    const primitive = own(primitives, part.component);
    const node = record(part, parent, doc.createElement(primitive === undefined ? UNKNOWN_COMPONENT_ELEMENT : elementOf(primitive, plan.get(part.key))), plan);

    if (primitive === undefined) {
      // Shown, not dropped: its children are still realized inside it.
      node.dom.setAttribute(COMPONENT_ATTRIBUTE, part.component);
    } else {
      // What the primitive always is (`type="checkbox"`), before anything the tree says; the element is fresh, so its property slots hold their initial values.
      for (const [name, value] of Object.entries(primitive.attributes ?? {})) {
        node.dom.setAttribute(name, value);
      }

      groupOf(node, parent);

      for (const realization of Object.values(primitive.props ?? {})) {
        if (hasPropertySlot(realization)) {
          node.initial.set(realization.name, slots(node.dom)[realization.name]);
        }
      }

      for (const [name, output] of node.outputs) {
        writeProp(node, own(primitive.props, name)!, output);
      }

      if (primitive.layer === "popover") {
        node.dom.setAttribute("popover", popoverMode(primitive, node.outputs));
      }

      reassert(node);
    }

    nodeOf.set(node.dom, node);
    byKey.set(node.key, node);
    registerLayer(node);
    node.children = part.children.map((child) => create(child, node, plan));
    node.dom.append(...node.children.map((child) => child.dom));

    return node;
  };

  /**
   * Makes the element of `node` the one its realized props choose, when it is not that: a new element takes the old one's place and children (each child keeps its DOM node and its
   * state), the primitive's constants, the group, and every prop of `outputs`. Reports nothing: the same node is drawn, in another element.
   */
  const reelement = (node: DrawnNode, outputs: ReadonlyMap<string, Output>): void => {
    const primitive = node.primitive;

    if (primitive === undefined || elementOf(primitive, outputs) === node.dom.localName) {
      return;
    }

    const previous = node.dom;
    const fresh = doc.createElement(elementOf(primitive, outputs));

    for (const [name, value] of Object.entries(primitive.attributes ?? {})) {
      fresh.setAttribute(name, value);
    }

    nodeOf.delete(previous);
    node.dom = fresh;
    nodeOf.set(fresh, node);
    node.initial.clear();

    for (const realization of Object.values(primitive.props ?? {})) {
      if (hasPropertySlot(realization)) {
        node.initial.set(realization.name, slots(fresh)[realization.name]);
      }
    }

    groupOf(node, node.parent);
    fresh.append(...Array.from(previous.childNodes));
    previous.replaceWith(fresh);

    for (const [name, output] of outputs) {
      writeProp(node, own(primitive.props, name)!, output);
    }

    node.outputs = outputs;
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
        reelement(old, outputs);

        for (const name of new Set([...old.outputs.keys(), ...outputs.keys()])) {
          const after = outputs.get(name) ?? ABSENT;

          if (!sameOutput(old.outputs.get(name) ?? ABSENT, after)) {
            writeProp(old, own(old.primitive.props, name)!, after);
          }
        }
      }

      old.outputs = outputs;
      reassert(old);   // every presentation, changed or not: a controlled field shows what was rendered
      // Bindings are read when an interaction resolves, so the node, and its
      // DOM element, stay as they are when a binding changes.
      old.handlers = new Map(Object.entries(next.events));

      // Children are matched by key, never by position (MESH §9.10): a key
      // in both trees keeps its drawn part, which is patched in place and
      // moved if its order changed; a key only in the new tree is created; a
      // key only in the old one is disposed. Position carries no identity.
      const previous = new Map(old.children.map((child) => [child.key, child] as const));
      const children = next.children.map((child): Drawn => {
        const was = previous.get(child.key);

        if (was === undefined) {
          return create(child, old, plan);
        }

        previous.delete(child.key);

        return patch(was, child, old, plan);
      });

      for (const gone of previous.values()) {
        dispose(gone);
        gone.dom.remove();
      }

      // Put the DOM in the new order, touching only what is out of place: a
      // part already where it belongs is not detached, so it keeps its state.
      let cursor: ChildNode | null = old.dom.firstChild;

      for (const child of children) {
        if (child.dom === cursor) {
          cursor = cursor.nextSibling;
        } else {
          old.dom.insertBefore(child.dom, cursor);
        }
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

  const verify = (part: RenderNode | TextRun, found: Node | undefined, plan: Plan, parents: ReadonlyArray<RenderNode> = []): HydrationMismatch | undefined => {
    const mismatch = (cls: HydrationMismatchClass, expected: string, actual: string): HydrationMismatch =>
      ({ class: cls, key: part.key, expected, found: actual });

    if (part.type === "text") {
      return found !== undefined && found.nodeType === TEXT_NODE && (found as Text).data === part.text
        ? undefined
        : mismatch("text", `the text "${part.text}"`, describeNode(found));
    }

    const primitive = own(primitives, part.component);
    const tag = primitive === undefined ? UNKNOWN_COMPONENT_ELEMENT : elementOf(primitive, plan.get(part.key));

    if (found === undefined || found.nodeType !== ELEMENT_NODE || (found as Element).localName !== tag || (found as Element).namespaceURI !== HTML_NAMESPACE) {
      return mismatch("element", `<${tag}>`, describeNode(found));
    }

    const element = found as Element;
    const expected = expectedAttributes(part, primitive, plan, groupKeyOf(primitive, [...parents].reverse()));

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
      const cls: HydrationMismatchClass = primitive === undefined && extra === COMPONENT_ATTRIBUTE ? "component" : realization?.kind === "boolean-attribute" || realization?.kind === "controlled-boolean" ? "boolean-attribute" : "attribute";

      return mismatch(cls, `no ${extra}`, `${extra}="${element.getAttribute(extra)}"`);
    }

    const children = part.children.filter(serialized);
    const nodes = Array.from(element.childNodes);

    if (nodes.length !== children.length) {
      return mismatch("child-count", `${children.length} child nodes`, `${nodes.length}`);
    }

    for (const [index, child] of children.entries()) {
      const found = verify(child, nodes[index], plan, [...parents, part]);

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

  /**
   * Adopts the verified `dom` as `part`: records it, fills in what HTML
   * couldn't carry (empty text nodes, present property values), and
   * nothing else. The records go to `adopted`, and are registered only
   * once all of adoption has succeeded.
   */
  const adopt = (part: RenderNode, dom: Element, parent: DrawnNode | undefined, plan: Plan, adopted: Array<DrawnNode>): DrawnNode => {
    const node = record(part, parent, dom, plan);

    if (node.primitive !== undefined) {
      const primitive = node.primitive;

      groupOf(node, parent);

      // The initial value is a fresh element's, never the adopted element's,
      // whose state the server's markup or the user may have changed.
      for (const realization of Object.values(primitive.props ?? {})) {
        if (hasPropertySlot(realization)) {
          node.initial.set(realization.name, slots(probe(dom.localName))[realization.name]);
        }
      }

      // Present property values, which server HTML can't carry, are applied.
      // An absent one isn't written: PORT never wrote the slot.
      for (const [name, output] of node.outputs) {
        const realization = own(primitive.props, name)!;

        if (isPropertyClass(realization) && !("absent" in output)) {
          try {
            writeProp(node, realization, output);
          } catch (error) {
            // A DOM property setter is outside PORT: its failure, and anything
            // it or adoption did before it, is reported, not rolled back.
            throw new WebRealizationError("adoption-failed", `<${part.component}>'s prop \`${name}\`: assigning the DOM property \`${realization.name}\` threw during hydration's adoption, after verification succeeded. The server DOM may be partly adopted, and PORT doesn't roll it back. Nothing is drawn.`, part.key, error);
          }
        }
      }
    }

    reassert(node);   // text typed before hydration is replaced by what was rendered: the application's value

    adopted.push(node);
    byKey.set(node.key, node);
    registerLayer(node);

    const nodes = Array.from(dom.childNodes);
    let next = 0;

    node.children = part.children.map((child): Drawn => {
      if (child.type === "text") {
        if (child.text === "") {
          // An empty text run has no server node: it is created, in its place.
          const text = doc.createTextNode("");
          dom.insertBefore(text, nodes[next] ?? null);
          const empty: DrawnText = { kind: "text", key: child.key, parent: node, dom: text, text: "" };
          byKey.set(child.key, empty);

          return empty;
        }

        const adoptedText: DrawnText = { kind: "text", key: child.key, parent: node, dom: nodes[next++] as Text, text: child.text };
        byKey.set(child.key, adoptedText);

        return adoptedText;
      }

      return adopt(child, nodes[next++] as Element, node, plan, adopted);
    });

    return node;
  };

  // -------------------------------------------------------------------------
  // Focus follows identity (I2, I12). A browser drops focus from an element that is moved (`insertBefore`) or removed, and puts it on the body; the person
  // did nothing, so the PORT puts it back: by key, with the selection of a text field, and when the focused part is gone on what follows it, then what
  // precedes it, then what holds it. While it does, the focus events its own moves make are not interactions and are not reported.

  let restoring = false;

  /** The drawn node the focused element belongs to, if focus is inside the container. */
  const focusedPart = (): DrawnNode | undefined => {
    const active = doc.activeElement;

    for (let at: Node | null = active; at !== null && at !== container; at = at.parentNode) {
      const found = nodeOf.get(at);

      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  };

  /** Focuses `part`, or the first part under it (in document order) that takes focus. */
  const focusWithin = (part: Drawn): boolean => {
    if (part.kind === "text") {
      return false;
    }

    (part.dom as HTMLElement).focus?.({ preventScroll: true });

    if (doc.activeElement === part.dom) {
      return true;
    }

    return part.children.some(focusWithin);
  };

  /** Where focus goes when `at` is gone: what follows it, what precedes it (nearest first), then what holds it. */
  const heirs = (at: DrawnNode): ReadonlyArray<string> => {
    const keys: string[] = [at.key];

    for (let node: DrawnNode | undefined = at; node !== undefined; node = node.parent) {
      const siblings = node.parent?.children ?? [];
      const index = siblings.indexOf(node);

      if (node === at) {
        keys.push(...siblings.slice(index + 1).map((each) => each.key), ...siblings.slice(0, index).reverse().map((each) => each.key));
      } else {
        keys.push(node.key);
      }
    }

    return keys;
  };

  // -------------------------------------------------------------------------
  // Layers (decisions I4 to I8, Bet 9). `open` is the application's: after every pass the PORT shows and hides each layer to match it. A modal is a `<dialog>` shown with `showModal()`, so the rest
  // of the page is inert, Tab stays inside and Escape asks to close; a popover is shown with `showPopover()` and sits against its anchor where the browser has anchor positioning. When the
  // person asks to close, the PORT reports `dismiss` with the reason, and the layer stays open until the application says otherwise: a browser that closes it anyway (a second Escape that cannot
  // be refused) has it drawn again. Closing returns focus to what had it before the layer opened, by key, and not to what the browser guesses.

  /** How long a layer the browser closed against the application's `open` waits for the application to answer the `dismiss` before it is drawn again. */
  const REASSERT_MS = 100;

  interface Layer {
    readonly node: DrawnNode;
    /** What the PORT last did: shown, or hidden. */
    shown: boolean;
    /** The key of the part that had focus when the layer opened, to return focus to when it closes. */
    invoker: string | undefined;
    /** The layer is gone or closed and focus has not been returned yet. */
    returning: boolean;
    /** A `cancel` is on its way to a `close` (Escape): the one `dismiss` is reported already. */
    escaped: boolean;
    reopen: ReturnType<typeof setTimeout> | undefined;
  }

  const layers = new Map<DrawnNode, Layer>();
  /** Focus owed to a part after a layer that is gone: (invoker, the layer's parent). */
  const owed: Array<readonly [invoker: string | undefined, parent: string | undefined]> = [];
  let escapeAt = -Infinity;
  let layersMoved = false;

  const wants = (layer: Layer): boolean => layer.node.primitive !== undefined && layerIsOpen(layer.node.primitive, layer.node.outputs);

  const dismiss = (layer: Layer, reason: "escape" | "outside"): void => {
    const handler = layer.node.handlers.get("dismiss");

    if (handler !== undefined) {
      report(handler, reason);
    }
  };

  /** The browser closed the layer, and the application has it open still: after a moment to answer the `dismiss`, it is drawn again. */
  const reassertLayer = (layer: Layer): void => {
    clearTimeout(layer.reopen);
    layer.reopen = setTimeout(() => {
      layer.reopen = undefined;

      if (layers.get(layer.node) === layer && wants(layer) && !layer.shown) {
        showLayer(layer);
      }
    }, REASSERT_MS);
  };

  /** What Tab reaches inside a layer: links, enabled controls and what asks for a place in the tab order. A radio is reached only at the checked one of its group, as the browser does it. */
  const TABBABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"]';

  const tabbablesIn = (element: HTMLElement): HTMLElement[] =>
    Array.from(element.querySelectorAll<HTMLElement>(TABBABLE)).filter((candidate) => {
      if (candidate.matches(":disabled") || candidate.closest("[inert]") !== null || (candidate.getAttribute("tabindex") !== null && Number(candidate.getAttribute("tabindex")) < 0)) {
        return false;
      }

      if (candidate instanceof (doc.defaultView?.HTMLInputElement ?? Object) && (candidate as HTMLInputElement).type === "radio" && (candidate as HTMLInputElement).name !== "") {
        const group = Array.from(element.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter((each) => each.name === (candidate as HTMLInputElement).name);
        const checked = group.find((each) => each.checked);

        return checked === undefined ? candidate === group[0] : candidate === checked;
      }

      return true;
    });

  const registerLayer = (node: DrawnNode): void => {
    if (node.primitive?.layer === undefined) {
      return;
    }

    const layer: Layer = { node, shown: false, invoker: undefined, returning: false, escaped: false, reopen: undefined };
    const element = node.dom as HTMLElement;

    layers.set(node, layer);

    if (node.primitive.layer === "modal") {
      // The pattern: Tab and Shift+Tab do not leave the dialog. The platform lets Tab go on to the browser's own controls after the last one, so the PORT wraps (decision I20).
      element.addEventListener("keydown", (event) => {
        if (event.key !== "Tab" || event.defaultPrevented || !layer.shown) {
          return;
        }

        const tabbables = tabbablesIn(element);
        const active = doc.activeElement;
        const first = tabbables[0];
        const last = tabbables[tabbables.length - 1];

        if (first === undefined || last === undefined) {
          event.preventDefault();

          return;
        }

        if (event.shiftKey ? active === first || active === element : active === last) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      });
      element.addEventListener("cancel", (event) => {
        if (wants(layer)) {
          layer.escaped = true;
          dismiss(layer, "escape");

          if (event.cancelable) {
            event.preventDefault();
          }
        }
      });
      element.addEventListener("close", () => {
        const asked = layer.escaped;

        layer.escaped = false;

        if (layer.shown) {
          // not the PORT's doing
          layer.shown = false;
          layer.returning = true;

          if (wants(layer)) {
            if (!asked) {
              dismiss(layer, "escape");
            }

            reassertLayer(layer);
          }
        }
      });
      element.addEventListener("click", (event) => {
        if (event.target === element && wants(layer)) {
          const box = element.getBoundingClientRect();
          const { clientX: x, clientY: y } = event as MouseEvent;

          if (x < box.left || x > box.right || y < box.top || y > box.bottom) {
            dismiss(layer, "outside");
          }
        }
      });
    } else {
      element.addEventListener("toggle", (event) => {
        if ((event as Event & { readonly newState?: string }).newState === "closed" && layer.shown) {
          layer.shown = false;
          layer.returning = true;

          if (wants(layer)) {
            dismiss(layer, doc.defaultView !== null && performance.now() - escapeAt < 100 ? "escape" : "outside");
            reassertLayer(layer);
          }
        }
      });
    }
  };

  const forgetLayer = (part: DrawnNode): void => {
    const layer = layers.get(part);

    if (layer !== undefined) {
      clearTimeout(layer.reopen);
      layers.delete(part);

      if (layer.shown || layer.returning) {
        owed.push([layer.invoker, part.parent?.key]);
        layersMoved = true;
      }
    }
  };

  /** Where a popover sits: against the element whose `id` the tree names, by the placement, where the browser has anchor positioning. Otherwise it is where the top layer puts it. */
  const placeLayer = (layer: Layer): void => {
    const primitive = layer.node.primitive!;
    const element = layer.node.dom as HTMLElement;
    const roles = layerRoles(primitive);
    const named = (role: string): string | undefined => {
      const prop = roles.get(role);
      const output = prop === undefined ? undefined : layer.node.outputs.get(prop);

      return output !== undefined && "text" in output ? output.text : undefined;
    };
    const anchor = named("anchor");

    if (primitive.layer !== "popover" || anchor === undefined || typeof CSS === "undefined" || !CSS.supports("position-area", "top")) {
      return;
    }

    const target = Array.from(container.querySelectorAll("[id]")).find((candidate) => candidate.id === anchor) as HTMLElement | undefined;

    if (target === undefined) {
      return;
    }

    const name = `--port-anchor-${scope.replace(/\W/g, "")}${layer.node.key}`;
    const area = { top: "block-start center", bottom: "block-end center", start: "inline-start center", end: "inline-end center" }[named("placement") ?? "bottom"] ?? "block-end center";

    target.style.setProperty("anchor-name", name);
    element.style.setProperty("position-anchor", name);
    element.style.setProperty("position-area", area);
    element.style.setProperty("position-try-fallbacks", "flip-block, flip-inline");
  };

  const showLayer = (layer: Layer): void => {
    const element = layer.node.dom as HTMLElement & { showModal?: () => void; close?: () => void; showPopover?: () => void };

    if (!element.isConnected) {
      return; // gone from the document (a timer that outlived the page): nothing to show
    }

    const inside = doc.activeElement !== null && element.contains(doc.activeElement);

    layer.invoker = inside ? layer.invoker : focusedPart()?.key;
    layer.shown = true;
    layer.returning = false;
    layersMoved = true;

    if (layer.node.primitive!.layer === "modal") {
      // A dialog the server wrote open is not modal: close it and show it again, which is the one focus move at hydration (decision I7).
      if (element.hasAttribute("open") && typeof element.close === "function") {
        element.close();
      }

      if (typeof element.showModal === "function") {
        element.showModal();
      } else {
        element.setAttribute("open", "");
      }
    } else {
      placeLayer(layer);

      if (typeof element.showPopover === "function") {
        element.showPopover();
      }
    }
  };

  const hideLayer = (layer: Layer): void => {
    const element = layer.node.dom as HTMLElement & { close?: () => void; hidePopover?: () => void };

    clearTimeout(layer.reopen);
    layer.reopen = undefined;
    layer.shown = false;
    layersMoved = true;

    if (layer.node.primitive!.layer === "modal") {
      if (typeof element.close === "function") {
        element.close();
      } else {
        element.removeAttribute("open");
      }
    } else if (typeof element.hidePopover === "function" && element.matches(":popover-open")) {
      element.hidePopover();
    }
  };

  /** After a pass: every layer shown or hidden to match the application's `open`, and focus returned for those that closed. Returns whether it moved focus's whole neighborhood (a layer opened or closed). */
  const settleLayers = (): boolean => {
    layersMoved = false;

    for (const layer of layers.values()) {
      const open = wants(layer);

      if (open && !layer.shown) {
        clearTimeout(layer.reopen);
        showLayer(layer);
      } else if (open && layer.shown && layer.node.primitive!.layer === "modal" && (layer.node.dom as HTMLElement).hasAttribute("open") && !(layer.node.dom as HTMLElement).matches(":modal")) {
        // adopted open and not modal: the upgrade
        layer.shown = false;
        showLayer(layer);
      } else if (!open && (layer.shown || layer.returning)) {
        const invoker = layer.invoker;

        hideLayer(layer);
        layer.returning = false;
        layer.invoker = undefined;
        owed.push([invoker, layer.node.parent?.key]);
      } else if (open && layer.shown) {
        placeLayer(layer);
      }
    }

    for (const [invoker, parent] of owed.splice(0)) {
      const target = invoker === undefined ? undefined : byKey.get(invoker);

      if (target !== undefined && focusWithin(target)) {
        continue;
      }

      const holder = parent === undefined ? undefined : byKey.get(parent);

      if (holder !== undefined) {
        focusWithin(holder);
      }
    }

    return layersMoved;
  };

  const keepingFocus = <T,>(run: () => T): T => {
    const was = focusedPart();

    if (was === undefined) {
      restoring = true;

      try {
        const result = run();

        settleLayers();

        return result;
      } finally {
        restoring = false;
      }
    }

    const field = was.dom as Element & { selectionStart?: number | null; selectionEnd?: number | null; selectionDirection?: string | null; setSelectionRange?: (start: number, end: number, direction?: "forward" | "backward" | "none") => void };
    let selection: [number, number, string | null] | undefined;

    try {
      if (field.selectionStart != null && field.selectionEnd != null) {
        selection = [field.selectionStart, field.selectionEnd, field.selectionDirection ?? null];
      }
    } catch { /* a field with no selection (a number input) */ }

    const order = heirs(was);
    const before = doc.activeElement;

    restoring = true;

    try {
      const result = run();

      // A layer that opened or closed has moved focus where it belongs (inside it, or back to the part that opened it): not to be undone.
      if (settleLayers() || (doc.activeElement === before && before?.isConnected)) {
        return result;
      }

      for (const key of order) {
        const part = byKey.get(key);

        if (part !== undefined && focusWithin(part)) {
          if (key === was.key && selection !== undefined) {
            try { field.setSelectionRange?.(selection[0], selection[1], (selection[2] ?? "none") as "forward" | "backward" | "none"); } catch { /* as above */ }
          }

          break;
        }
      }

      return result;
    } finally {
      restoring = false;
    }
  };

  const plain: Omit<WebPort, typeof Symbol.dispose> = {
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

    patch(patches) {
      if (drawn === undefined) {
        throw new WebRealizationError("not-drawn", "patch needs a drawn tree: call draw first");
      }

      if (patches.format !== "mesh-render-patch" || patches.version !== 1) {
        throw new WebRealizationError("unsupported-patch", `expected a render-patch-v1 list (format "mesh-render-patch", version 1), got format ${JSON.stringify(patches.format)}, version ${JSON.stringify(patches.version)}`);
      }

      const list = patches.patches;
      const only = list[0];

      // A replace is a draw: nothing is reused, and it stands alone.
      if (list.some((patch) => patch.op === "replace")) {
        if (list.length !== 1 || only === undefined || only.op !== "replace") {
          throw new WebRealizationError("unsupported-patch", "a replace is the only operation of its list");
        }

        drawChecked(only.tree, checkTree(only.tree, primitives));

        return [only.tree.root.key];
      }

      // Check every operation before the DOM is touched: a list that can't
      // be realized changes nothing. Each operation is checked against the
      // tree as the operations before it leave it (a shadow of the parts a
      // list touches, made from what is drawn only when an operation needs
      // it), because a later operation may name a part an earlier one made.
      // A prop is realized exactly as `update` would (checkTree's rule,
      // through realizeProp).
      interface Shadow {
        readonly kind: "node" | "text";
        readonly component: string | undefined;
        parent: string | undefined;
        /** A node's children, in order. */
        children: string[];
        /** The props a node has now. */
        props: Set<string>;
        removed: boolean;
      }

      const shadows = new Map<string, Shadow>();

      const shadowOf = (key: string): Shadow | undefined => {
        let found = shadows.get(key);

        if (found === undefined) {
          const part = byKey.get(key);

          if (part === undefined) {
            return undefined;
          }

          found = part.kind === "node"
            ? { kind: "node", component: part.component, parent: part.parent?.key, children: part.children.map((child) => child.key), props: new Set(part.outputs.keys()), removed: false }
            : { kind: "text", component: undefined, parent: part.parent?.key, children: [], props: new Set(), removed: false };
          shadows.set(key, found);
        }

        return found.removed ? undefined : found;
      };

      /** Records an inserted part, and every part under it, as present. */
      const shadowInsert = (part: RenderNode | TextRun, parent: string): void => {
        if (part.type === "text") {
          shadows.set(part.key, { kind: "text", component: undefined, parent, children: [], props: new Set(), removed: false });

          return;
        }

        shadows.set(part.key, { kind: "node", component: part.component, parent, children: part.children.map((child) => child.key), props: new Set(Object.keys(part.props)), removed: false });
        part.children.forEach((child) => shadowInsert(child, part.key));
      };

      /** Marks a part, and every part under it, as gone. */
      const shadowRemove = (key: string): void => {
        const part = shadowOf(key);

        if (part === undefined) {
          return;
        }

        part.removed = true;
        part.children.forEach(shadowRemove);
      };

      const rootKey = drawn.key;
      const unsupported = (message: string, key?: string): WebRealizationError => new WebRealizationError("unsupported-patch", message, key);

      type Step =
        | { readonly kind: "prop"; readonly key: string; readonly name: string; readonly realization: PropRealization; readonly output: Output }
        | { readonly kind: "text"; readonly key: string; readonly text: string }
        | { readonly kind: "insert"; readonly parent: string; readonly before: string | undefined; readonly part: RenderNode | TextRun; readonly plan: Plan }
        | { readonly kind: "remove"; readonly key: string }
        | { readonly kind: "move"; readonly key: string; readonly before: string | undefined };

      const steps: Step[] = [];

      list.forEach((patch, index) => {
        if (patch.op === "replace") {
          return; // alone in its list, handled above
        }

        const at = `operation ${index} (${JSON.stringify((patch as { readonly op: unknown }).op)})`;

        // An operation this PORT doesn't know is refused, never skipped: skipping it would break the law that patches give the full tree.
        if (patch.op !== "setProp" && patch.op !== "removeProp" && patch.op !== "setText" && patch.op !== "insert" && patch.op !== "remove" && patch.op !== "move") {
          throw unsupported(`${at}: this PORT doesn't know that operation`);
        }

        const named = patch.op === "insert" ? patch.parent : patch.key;
        const target = shadowOf(named);

        if (target === undefined) {
          throw new WebRealizationError("unknown-key", `${at} names the key ${named}, which isn't in the drawn tree at that point`, named);
        }

        if (patch.op === "insert") {
          if (target.kind !== "node") {
            throw unsupported(`${at} inserts under ${patch.parent}, which is a text run`, patch.parent);
          }

          // A fresh key: the part's, and every key under it, are in the tree at no other place.
          const fresh = (part: RenderNode | TextRun): void => {
            if (shadowOf(part.key) !== undefined) {
              throw new WebRealizationError("duplicate-key", `${at} inserts the key ${part.key}, which is already in the tree`, part.key);
            }

            if (part.type === "node") {
              part.children.forEach(fresh);
            }
          };

          fresh(patch.node);

          if (patch.before !== undefined && shadowOf(patch.before)?.parent !== patch.parent) {
            throw new WebRealizationError("unknown-key", `${at} inserts before ${patch.before}, which isn't a child of ${patch.parent} at that point`, patch.before);
          }

          // The part is checked as a tree of its own would be: every prop and event realized, void elements, adjacent text.
          const plan = patch.node.type === "node" ? checkTree({ format: "mesh-render", version: 1, root: patch.node }, primitives) : new Map<string, ReadonlyMap<string, Output>>();
          const siblings = target.children;
          siblings.splice(patch.before === undefined ? siblings.length : siblings.indexOf(patch.before), 0, patch.node.key);
          shadowInsert(patch.node, patch.parent);
          steps.push({ kind: "insert", parent: patch.parent, before: patch.before, part: patch.node, plan });

          return;
        }

        if (patch.op === "remove" || patch.op === "move") {
          if (patch.key === rootKey) {
            throw unsupported(`${at} acts on the root, which has no siblings: use replace`, patch.key);
          }

          const siblings = shadowOf(target.parent!)!.children;
          const from = siblings.indexOf(patch.key);

          if (patch.op === "remove") {
            siblings.splice(from, 1);
            shadowRemove(patch.key);
            steps.push({ kind: "remove", key: patch.key });

            return;
          }

          if (patch.before !== undefined && (patch.before === patch.key || shadowOf(patch.before)?.parent !== target.parent)) {
            throw new WebRealizationError("unknown-key", `${at} moves ${patch.key} before ${patch.before}, which isn't another child of its parent at that point`, patch.before);
          }

          siblings.splice(from, 1);
          siblings.splice(patch.before === undefined ? siblings.length : siblings.indexOf(patch.before), 0, patch.key);
          steps.push({ kind: "move", key: patch.key, before: patch.before });

          return;
        }

        if (patch.op === "setText") {
          if (target.kind !== "text") {
            throw unsupported(`${at} sets the text of ${patch.key}, which is a node, not a text run`, patch.key);
          }

          steps.push({ kind: "text", key: patch.key, text: patch.text });

          return;
        }

        if (target.kind !== "node") {
          throw unsupported(`${at} changes a prop of ${patch.key}, which is a text run, not a node`, patch.key);
        }

        // An unknown component's props aren't realized, as for `update`.
        const primitive = own(primitives, target.component!);

        if (primitive === undefined) {
          return;
        }

        const realization = own(primitive.props, patch.prop);

        if (realization === undefined) {
          if (patch.op === "removeProp" && !target.props.has(patch.prop)) {
            return;
          }

          throw new WebRealizationError("unrealized-prop", `<${target.component}> has no realization for its prop \`${patch.prop}\``, patch.key);
        }

        const output = patch.op === "removeProp"
          ? ABSENT
          : realizeProp({ type: "node", key: patch.key, component: target.component!, props: { [patch.prop]: patch.value }, events: {}, children: [], ...(patch.propText === undefined ? {} : { propText: { [patch.prop]: patch.propText } }) }, patch.prop, realization);

        if (isUnrealizable(output)) {
          throw new WebRealizationError(output.code, `<${target.component}>'s prop \`${patch.prop}\` ${output.reason} (its ${realization.kind} \`${realization.name}\`)`, patch.key);
        }

        if (patch.op === "removeProp") {
          target.props.delete(patch.prop);
        } else {
          target.props.add(patch.prop);
        }

        steps.push({ kind: "prop", key: patch.key, name: patch.prop, realization, output });
      });

      // Apply. Only a DOM setter or insertion can fail from here, and it is outside PORT.
      let index = 0;

      /** The DOM node `before` names among `parent`'s children, or none for last. */
      const reference = (before: string | undefined): ChildNode | null => (before === undefined ? null : byKey.get(before)!.dom);

      const place = (parent: DrawnNode, part: Drawn, before: string | undefined): void => {
        const at = before === undefined ? parent.children.length : parent.children.findIndex((child) => child.key === before);
        parent.children.splice(at, 0, part);
        parent.dom.insertBefore(part.dom, reference(before));
      };

      try {
        for (; index < steps.length; index += 1) {
          const step = steps[index]!;

          switch (step.kind) {
            case "text": {
              const part = byKey.get(step.key) as DrawnText;

              if (part.text !== step.text) {
                part.dom.data = step.text;
                part.text = step.text;
              }

              break;
            }
            case "insert": {
              const parent = byKey.get(step.parent) as DrawnNode;
              place(parent, create(step.part, parent, step.plan), step.before);

              break;
            }
            case "remove": {
              const part = byKey.get(step.key)!;
              const parent = part.parent!;
              parent.children = parent.children.filter((child) => child !== part);
              dispose(part);
              part.dom.remove();

              break;
            }
            case "move": {
              const part = byKey.get(step.key)!;
              const parent = part.parent!;
              parent.children = parent.children.filter((child) => child !== part);
              place(parent, part, step.before);

              break;
            }
            case "prop": {
              const node = byKey.get(step.key) as DrawnNode;
              const outputs = new Map(node.outputs);

              if ("absent" in step.output) {
                outputs.delete(step.name);
              } else {
                outputs.set(step.name, step.output);
              }

              reelement(node, outputs);

              if (!sameOutput(node.outputs.get(step.name) ?? ABSENT, step.output)) {
                writeProp(node, step.realization, step.output);
              }

              node.outputs = outputs;
              reassert(node);
            }
          }
        }
        return [...new Set(steps.map((step) => (step.kind === "insert" ? step.part.key : step.key)))];
      } catch (error) {
        throw new WebRealizationError("patch-failed", `applying step ${index} of the validated patch list threw. The steps before it were applied, and PORT doesn't undo them: draw the full tree to recover.`, undefined, error);
      }
    },

    inspect(key) {
      return byKey.get(key)?.dom;
    },

    focus(key) {
      const part = byKey.get(key);

      return part !== undefined && focusWithin(part);
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

      // Adoption: only now, with everything verified, does the DOM change. A
      // setter failure here throws adoption-failed, with nothing drawn and no
      // listeners; there is no retry and no fallback draw.
      const adopted: Array<DrawnNode> = [];
      const root = adopt(tree.root, nodes[0] as Element, undefined, plan, adopted);

      for (const node of adopted) {
        nodeOf.set(node.dom, node);
      }

      drawn = root;
      listen(true);
      settleLayers();

      return { adopted: true };
    },

    unmount() {
      listen(false);

      for (const layer of layers.values()) {
        clearTimeout(layer.reopen);
      }

      layers.clear();
      owed.length = 0;

      if (drawn !== undefined) {
        dispose(drawn);
      }

      container.replaceChildren();
      drawn = undefined;
      byKey.clear();
    },
  };

  const port: Omit<WebPort, typeof Symbol.dispose> = {
    ...plain,
    draw: (tree) => keepingFocus(() => plain.draw(tree)),
    update: (tree) => keepingFocus(() => plain.update(tree)),
    patch: (patches) => keepingFocus(() => plain.patch(patches)),
  };

  // Where the platform has `Symbol.dispose`, `using port = ...` unmounts at the end of the block.
  if (typeof Symbol.dispose === "symbol") {
    Object.defineProperty(port, Symbol.dispose, { value: () => port.unmount(), configurable: true });
  }

  return port as WebPort;
};
