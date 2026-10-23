// Fetches the web-platform-tests files of subset.json, and what they load, at the pinned commit into .cache/ (git-ignored): `node wpt/fetch.mjs`. Nothing of web-platform-tests is kept in this tree.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const { commit, tests } = JSON.parse(readFileSync(join(here, "subset.json"), "utf8"));
const cache = join(here, ".cache");
const seen = new Set();

const get = async (path) => {
  const target = join(cache, path);

  if (existsSync(target)) {
    return readFileSync(target, "utf8");
  }

  const response = await fetch(`https://raw.githubusercontent.com/web-platform-tests/wpt/${commit}/${path}`);

  if (!response.ok) {
    return undefined;
  }

  const text = await response.text();

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);

  return text;
};

/** The files a page names with src and href, as paths from the repository's root. */
const references = (path, text) =>
  [...text.matchAll(/\b(?:src|href)=["']([^"'#?]+)["']/g)]
    .map((match) => match[1])
    .filter((url) => !/^(https?:)?\/\//.test(url) && /\.(js|html|css|svg|png|mp4|json)$/.test(url))
    .map((url) => (url.startsWith("/") ? url.slice(1) : posix.join(posix.dirname(path), url)));

const visit = async (path) => {
  if (seen.has(path)) {
    return;
  }

  seen.add(path);

  const text = await get(path);

  if (text === undefined) {
    console.error(`not found: ${path}`);

    return;
  }

  if (/\.(html|js)$/.test(path)) {
    const found = path.endsWith(".js") ? [...text.matchAll(/(?:\/\/ META: script=|importScripts\(["'])([^"'\n]+)/g)].map((match) => (match[1].startsWith("/") ? match[1].slice(1) : posix.join(posix.dirname(path), match[1]))) : references(path, text);

    for (const next of found) {
      // the harness is the PORT's own shim (run.mjs), not fetched
      if (!/^resources\/(testharnessreport|testdriver)/.test(next)) {
        await visit(next);
      }
    }
  }
};

for (const path of Object.keys(tests)) {
  await visit(path);
}

await get("resources/testharness.js");
console.log(`${seen.size} files at ${commit}`);
