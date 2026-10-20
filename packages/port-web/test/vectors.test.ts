// The check of decision Q2 (Bet 2), run on this repository and, to show it can fail, on trees made for the
// purpose: one with a copy of the vectors planted in it, and one with an older package installed.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error a plain ES module with JSDoc types, outside this package
import { check } from "../../../scripts/check-conformance.mjs";

import { vectors } from "./vectors.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packageDir = join(fileURLToPath(vectors), "..");
const made: Array<string> = [];

/** A repository of its own: the claim, and nothing else. */
const tree = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "port-conformance-"));

  made.push(dir);
  writeFileSync(join(dir, "conformance.json"), JSON.stringify({ package: "@valancex/mesh-conformance", supports: "0.13.0" }));

  return dir;
};

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the conformance vectors are consumed from the package, never copied (Q2)", () => {
  it("passes on this repository: no copy anywhere, and the installed package is new enough", () => {
    expect(check(root)).toEqual([]);
  });

  it("fails on a planted copy of one vector", () => {
    const dir = tree();

    mkdirSync(join(dir, "fixtures", "mesh-conformance", "identity"), { recursive: true });
    cpSync(join(packageDir, "conformance", "identity", "cases.json"), join(dir, "fixtures", "mesh-conformance", "identity", "cases.json"));

    const problems = check(dir, { packageDir }) as Array<string>;

    expect(problems.join("\n")).toContain("fixtures/mesh-conformance/identity/cases.json is a copy of the vector identity/cases.json");
  });

  it("fails on a copy that has drifted, which is how the Web PORT's v0.6 copy went wrong", () => {
    const dir = tree();

    mkdirSync(join(dir, "vendored", "values"), { recursive: true });
    writeFileSync(join(dir, "vendored", "values", "cases.json"), "[]");

    expect((check(dir, { packageDir }) as Array<string>).join("\n")).toContain("vendored/values/cases.json is a drifted copy of the vector values/cases.json");
  });

  it("fails on a whole copy, naming every file", () => {
    const dir = tree();

    cpSync(join(packageDir, "conformance"), join(dir, "copy"), { recursive: true });

    const problems = (check(dir, { packageDir }) as Array<string>).join("\n");

    expect(problems).toContain("copy/identity/repeat/cases.json");
    expect(problems).toContain("copy/events/expected.tree.json");
  });

  it("is not fooled by an unrelated components.json", () => {
    const dir = tree();

    writeFileSync(join(dir, "components.json"), "{}");

    expect(check(dir, { packageDir })).toEqual([]);
  });

  it("fails when the installed package is older than the version claimed", () => {
    const dir = tree();
    const old = join(dir, "node_modules-old");

    mkdirSync(join(old, "conformance"), { recursive: true });
    writeFileSync(join(old, "package.json"), JSON.stringify({ name: "@valancex/mesh-conformance", version: "0.12.0" }));

    expect((check(dir, { packageDir: old }) as Array<string>).join("\n")).toContain("0.12.0 is installed, older than the 0.13.0");
  });

  it("fails when the package is not installed", () => {
    expect((check(tree()) as Array<string>).join("\n")).toContain("is not installed");
  });
});
