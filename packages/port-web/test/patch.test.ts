// patch(): MESH's render-patch-v1 applied in place. The law is the one
// MESH states: applying a list gives exactly what `update` of the full new
// tree gives, so each case draws one tree, patches it, and compares the DOM
// and the realized objects with a second PORT that drew the next tree. Hand-
// written trees and lists only: PORT knows no MPRX and doesn't need the MESH
// runtime to have the patch format.
import type { RenderPatches } from "../src/index.js";

import { describe, expect, it } from "vitest";

import { WebRealizationError, attribute, booleanAttribute, createWebPort, property } from "../src/index.js";

import { dom, handler, key, node, reports, slicePrimitives, text, tree } from "./support.js";

const patches = (...list: RenderPatches["patches"][number][]): RenderPatches => ({ format: "mesh-render-patch", version: 1, patches: list });

const view = (title: string, who: string, disabled: boolean) =>
  tree(node(1, "page", { title }, [
    text(2, `hello ${who}`),
    node(3, "button", { disabled }, [text(4, "go")], { click: handler(3) }),
  ]));

const setup = (primitives = slicePrimitives) => {
  const { window, container } = dom();
  const { calls, report } = reports();
  const port = createWebPort({ container, primitives, report });

  return { window, container, port, calls };
};

describe("patch: the law", () => {
  it("gives the DOM that update of the full next tree gives, and keeps every object", () => {
    const patched = setup();
    const updated = setup();
    patched.port.draw(view("a", "x", false));
    updated.port.draw(view("a", "x", false));
    const before = Array.from(patched.container.querySelectorAll("*"));
    const textBefore = patched.container.querySelector("section")!.firstChild;

    patched.port.patch(patches(
      { op: "setProp", key: key(1), prop: "title", value: "b" },
      { op: "setText", key: key(2), text: "hello y" },
      { op: "setProp", key: key(3), prop: "disabled", value: true },
    ));
    updated.port.update(view("b", "y", true));

    expect(patched.container.innerHTML).toBe(updated.container.innerHTML);
    expect(Array.from(patched.container.querySelectorAll("*"))).toEqual(before);
    expect(patched.container.querySelector("section")!.firstChild).toBe(textBefore);
  });

  it("removes a prop as update does, and a prop with MESH text realizes that text", () => {
    const patched = setup();
    patched.port.draw(view("a", "x", true));
    patched.port.patch(patches({ op: "removeProp", key: key(3), prop: "disabled" }));
    expect(patched.container.querySelector("button")!.hasAttribute("disabled")).toBe(false);

    const sized = setup();
    sized.port.draw(tree({ ...node(1, "avatar", { src: "a.png", alt: "x", size: 1 }), propText: { size: "1" } }));
    sized.port.patch(patches({ op: "setProp", key: key(1), prop: "size", value: 24, propText: "24" }));
    expect(sized.container.querySelector("img")!.getAttribute("data-size")).toBe("24");
  });

  it("an empty list changes nothing, and a replace is a draw", () => {
    const { container, port } = setup();
    port.draw(view("a", "x", false));
    const html = container.innerHTML;
    const before = container.querySelector("button");
    port.patch(patches());
    expect(container.innerHTML).toBe(html);
    expect(container.querySelector("button")).toBe(before);

    port.patch(patches({ op: "replace", tree: view("z", "q", false) }));
    expect(container.querySelector("section")!.getAttribute("aria-label")).toBe("z");
    expect(container.querySelector("button")).not.toBe(before);
  });

  it("a patched node still reports through its handler", () => {
    const { window, container, port, calls } = setup();
    port.draw(view("a", "x", false));
    port.patch(patches({ op: "setText", key: key(4), text: "went" }));
    container.querySelector("button")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual([[handler(3)]]);
  });
});

describe("patch: fine-grained DOM writes", () => {
  it("one changed field mutates exactly one DOM node", () => {
    const { window, container, port } = setup();
    port.draw(view("a", "x", false));
    const records: MutationRecord[] = [];
    const observer = new window.MutationObserver((list) => records.push(...list));
    observer.observe(container, { attributes: true, characterData: true, childList: true, subtree: true });

    port.patch(patches({ op: "setProp", key: key(3), prop: "disabled", value: true }));
    records.push(...observer.takeRecords());
    expect(records.map((record) => [record.type, (record.target as Element).localName])).toEqual([["attributes", "button"]]);

    records.length = 0;
    port.patch(patches({ op: "setText", key: key(2), text: "hello y" }));
    records.push(...observer.takeRecords());
    expect(records.map((record) => [record.type, record.target.nodeType])).toEqual([["characterData", 3]]);

    // A patch that changes nothing the DOM holds writes nothing.
    records.length = 0;
    port.patch(patches({ op: "setProp", key: key(3), prop: "disabled", value: true }, { op: "setText", key: key(2), text: "hello y" }));
    records.push(...observer.takeRecords());
    expect(records).toEqual([]);
  });
});

describe("patch: refused before the DOM is touched", () => {
  const refused = (list: RenderPatches, code: string) => {
    const { container, port } = setup();
    port.draw(view("a", "x", false));
    const html = container.innerHTML;

    expect(() => port.patch(list)).toThrowError(expect.objectContaining({ name: "WebRealizationError", code }));
    expect(container.innerHTML).toBe(html);
  };

  it("a key that isn't drawn", () => refused(patches({ op: "setText", key: key(99), text: "x" }), "unknown-key"));
  it("a text op on a node, and a prop op on a text run", () => {
    refused(patches({ op: "setText", key: key(1), text: "x" }), "unsupported-patch");
    refused(patches({ op: "setProp", key: key(2), prop: "title", value: "x" }), "unsupported-patch");
  });
  it("a prop the table doesn't realize", () => refused(patches({ op: "setProp", key: key(1), prop: "nope", value: "x" }), "unrealized-prop"));
  it("a value its slot can't hold, and a number with no propText", () => {
    refused(patches({ op: "setProp", key: key(1), prop: "title", value: [1] }), "unrealizable-value");
    refused(patches({ op: "setProp", key: key(1), prop: "title", value: 5 }), "missing-prop-text");
  });
  it("an operation it doesn't know, never skipped", () => refused({ format: "mesh-render-patch", version: 1, patches: [{ op: "move", key: key(1) } as never] }, "unsupported-patch"));
  it("another format or version", () => {
    refused({ format: "mesh-render", version: 1, patches: [] } as never, "unsupported-patch");
    refused({ format: "mesh-render-patch", version: 2, patches: [] } as never, "unsupported-patch");
  });
  it("a replace among other operations", () =>
    refused(patches({ op: "setText", key: key(2), text: "x" }, { op: "replace", tree: view("a", "x", false) }), "unsupported-patch"));
  it("a list that is bad at its last operation changes nothing of its first", () =>
    refused(patches({ op: "setText", key: key(2), text: "changed" }, { op: "setText", key: key(99), text: "x" }), "unknown-key"));
  it("a replace whose tree can't be realized", () => refused(patches({ op: "replace", tree: tree(node(1, "page", { weird: "x" })) }), "unrealized-prop"));

  it("nothing is drawn: patch needs a drawn tree", () => {
    const { port } = setup();
    expect(() => port.patch(patches())).toThrowError(expect.objectContaining({ code: "not-drawn" }));
  });
});

describe("patch: a DOM setter that throws", () => {
  it("reports patch-failed with the cause, and keeps the steps before it", () => {
    const primitives = {
      page: { element: "section", props: { title: attribute("aria-label"), flaky: property("flaky", "value") } },
      text: { element: "span" },
    };
    const { container, port } = setup(primitives);
    port.draw(tree(node(1, "page", { title: "a" }, [text(2, "t")])));
    const section = container.querySelector("section")!;
    Object.defineProperty(section, "flaky", { set() { throw new Error("no"); }, get: () => undefined });

    try {
      port.patch(patches(
        { op: "setProp", key: key(1), prop: "title", value: "b" },
        { op: "setProp", key: key(1), prop: "flaky", value: 1 },
      ));
      expect.unreachable("patch must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WebRealizationError);
      expect((error as WebRealizationError).code).toBe("patch-failed");
      expect(((error as WebRealizationError).cause as Error).message).toBe("no");
    }

    expect(section.getAttribute("aria-label")).toBe("b");
    // The composer recovers with a full draw, which works.
    port.draw(tree(node(1, "page", { title: "c" }, [text(2, "t")])));
    expect(container.querySelector("section")!.getAttribute("aria-label")).toBe("c");
  });
});

describe("patch after other operations", () => {
  it("works after update, which creates parts, and after hydrate-less redraws, and not for a removed key", () => {
    const { container, port } = setup();
    port.draw(tree(node(1, "page", { title: "a" }, [node(2, "button", {}, [text(3, "x")])])));
    port.update(tree(node(1, "page", { title: "a" }, [node(4, "button", { disabled: false }, [text(5, "y")])])));
    port.patch(patches({ op: "setProp", key: key(4), prop: "disabled", value: true }));
    expect(container.querySelector("button")!.hasAttribute("disabled")).toBe(true);
    expect(() => port.patch(patches({ op: "setProp", key: key(2), prop: "disabled", value: true }))).toThrowError(expect.objectContaining({ code: "unknown-key" }));
    port.unmount();
    expect(() => port.patch(patches())).toThrowError(expect.objectContaining({ code: "not-drawn" }));
  });

  it("a part drawn again under the same key is found", () => {
    const { container, port } = setup();
    port.draw(view("a", "x", false));
    port.draw(view("b", "y", false));
    port.patch(patches({ op: "setText", key: key(2), text: "again" }));
    expect(container.querySelector("section")!.firstChild!.textContent).toBe("again");
  });
});

// Used so the imports are checked even where a case above doesn't need them.
void booleanAttribute;
