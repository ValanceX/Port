// A URL slot never holds code: `javascript:` and `vbscript:` (and a navigable `data:`) in href, src, action, formaction and the like are refused as unrealizable, in the DOM writer, in a patch and
// in the server's HTML, because they all realize a prop by one rule (realize.ts). Safe URLs and non-URL attributes are untouched.
import { describe, expect, it } from "vitest";

import { attribute, createWebPort } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { dom, key, node, tree } from "./support.js";

const primitives = { link: { element: "a", props: { href: attribute("href"), label: attribute("title") } }, picture: { element: "img", props: { src: attribute("src") } } };
const code = (run: () => void): string | undefined => { try { run(); return undefined; } catch (error) { return (error as { code?: string }).code; } };
const draw = (component: string, props: Record<string, string>) => { const { container } = dom(); createWebPort({ container, primitives, report: () => {} }).draw(tree(node(1, component, props))); return container; };

describe("URL attributes", () => {
  it.each(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "  javascript:alert(1)", "java\tscript:alert(1)", "\u0001javascript:alert(1)", "vbscript:x", "data:text/html,<script>1</script>"])("refuses %j as an href", (href) => {
    expect(code(() => draw("link", { href }))).toBe("unrealizable-value");
    expect(code(() => realizeHtml(tree(node(1, "link", { href })), primitives))).toBe("unrealizable-value");
  });

  it("refuses javascript: in src, and allows data: images there", () => {
    expect(code(() => draw("picture", { src: "javascript:1" }))).toBe("unrealizable-value");
    expect(draw("picture", { src: "data:image/png;base64,AAAA" }).querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  it.each(["https://example.com/a", "/docs/a", "#top", "mailto:a@b.c", "tel:1", "?q=javascript:x", "docs/javascript:x"])("keeps %j", (href) => {
    expect(draw("link", { href }).querySelector("a")?.getAttribute("href")).toBe(href);
  });

  it("does not look at attributes that are not URLs", () => {
    expect(draw("link", { href: "/", label: "javascript:alert(1)" }).querySelector("a")?.getAttribute("title")).toBe("javascript:alert(1)");
  });

  it("refuses a patch that sets one, leaving the DOM untouched", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives, report: () => {} });

    port.draw(tree(node(1, "link", { href: "/" })));

    expect(code(() => port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "setProp", key: key(1), prop: "href", value: "javascript:alert(1)" }] } as never))).toBe("unrealizable-value");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/");
  });
});
