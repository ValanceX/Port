// The generated APG modal dialog vectors (overlays/) are what their generator writes from the quoted rows, and every vector says which sentence of the pattern it is for. The vectors are run by the two PORTs
// (integration/browser/overlay.browser.test.ts in Chromium, packages/port-desktop/tests/overlay_vectors.rs on the Desktop).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url).pathname;
const source = JSON.parse(readFileSync(`${root}overlays/apg-dialog-modal.source.json`, "utf8")) as { readonly commit: string; readonly rows: Record<string, string> };
const vectors = JSON.parse(readFileSync(`${root}overlays/dialog-modal.vectors.json`, "utf8")) as { readonly commit: string; readonly vectors: ReadonlyArray<{ readonly name: string; readonly apg: string; readonly steps: ReadonlyArray<unknown> }> };

describe("the generated modal dialog vectors", () => {
  it("are what the generator writes from the rows", () => {
    expect(spawnSync("node", ["scripts/generate-overlay-vectors.mjs", "--check"], { cwd: root, encoding: "utf8" }).status).toBe(0);
  });

  it("fail the check when a vector is not what the rows generate", () => {
    const scratch = mkdtempSync(join(tmpdir(), "overlays-"));

    mkdirSync(join(scratch, "overlays"));
    mkdirSync(join(scratch, "scripts"));
    copyFileSync(`${root}scripts/generate-overlay-vectors.mjs`, join(scratch, "scripts/generate-overlay-vectors.mjs"));
    copyFileSync(`${root}overlays/apg-dialog-modal.source.json`, join(scratch, "overlays/apg-dialog-modal.source.json"));
    writeFileSync(join(scratch, "overlays/dialog-modal.vectors.json"), readFileSync(`${root}overlays/dialog-modal.vectors.json`, "utf8").replace('"focused": "d1"', '"focused": "d2"'));

    expect(spawnSync("node", ["scripts/generate-overlay-vectors.mjs", "--check"], { cwd: scratch, encoding: "utf8" }).status).toBe(1);
  });

  it("each name the sentence of the pattern it is for, at the commit the rows are pinned to", () => {
    expect(vectors.commit).toBe(source.commit);
    expect(vectors.vectors).toHaveLength(33);

    for (const vector of vectors.vectors) {
      expect(Object.values(source.rows), vector.name).toContain(vector.apg);
      expect(vector.steps.length, vector.name).toBeGreaterThan(0);
    }
  });
});
