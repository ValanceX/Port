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

test("the text field's events are submit and cancel beside change, and focus and blur for coming and going", () => {
  assert.deepEqual(Object.keys(JSON.parse(read("../vocabulary.json")).components.textfield.events).sort(), ["blur", "cancel", "change", "focus", "submit"]);
});

test("the form primitives are optional and typed as the Web PORT's table has them", () => {
  const { components } = JSON.parse(read("../vocabulary.json"));
  const optional = (component, name, kind) => {
    const prop = components[component].props[name];

    assert.deepEqual(prop, { type: { kind }, required: false }, `${component}.${name}`);
  };

  optional("textfield", "kind", "string");
  optional("textfield", "invalid", "boolean");
  optional("textfield", "describedby", "string");
  optional("checkbox", "invalid", "boolean");
  optional("checkbox", "describedby", "string");
  optional("text", "id", "string");
  assert.deepEqual(JSON.parse(read("../content.json")).components.paragraph.props.id, { type: { kind: "string" }, required: false });
});

test("the package publishes the two files and nothing else", () => {
  const manifest = JSON.parse(read("../package.json"));

  assert.deepEqual(manifest.files, ["vocabulary.json", "content.json"]);
  assert.deepEqual(Object.keys(manifest.exports), ["./vocabulary.json", "./content.json", "./package.json"]);
});
