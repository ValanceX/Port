// The package is the crate's vocabulary, byte for byte, and it reads as the manifest the tools expect.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

for (const file of ["vocabulary.json", "content.json"]) {
  test(`${file} is the crate's, byte for byte`, () => {
    assert.equal(read(`../${file}`), read(`../../port-desktop/${file}`));
  });

  test(`${file} is a version-1 manifest of components`, () => {
    const manifest = JSON.parse(read(`../${file}`));

    assert.equal(manifest.version, 1);
    assert.equal(typeof manifest.components, "object");
    assert.ok(Object.keys(manifest.components).length > 0);
  });
}

test("the text field's events are submit and cancel beside change", () => {
  assert.deepEqual(Object.keys(JSON.parse(read("../vocabulary.json")).components.textfield.events).sort(), ["cancel", "change", "submit"]);
});

test("the package publishes the two files and nothing else", () => {
  const manifest = JSON.parse(read("../package.json"));

  assert.deepEqual(manifest.files, ["vocabulary.json", "content.json"]);
  assert.deepEqual(Object.keys(manifest.exports), ["./vocabulary.json", "./content.json", "./package.json"]);
});
