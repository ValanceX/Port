// Runs the subset of web-platform-tests (subset.json, fetched by fetch.mjs) in Chromium and compares what each subtest does with expected.json, the failures that are known: a browser's defect against its
// specification, with what it means for the PORT. A difference either way fails the run: a new failure is a regression, and a subtest that now passes is an expectation to remove.
//
//   node wpt/run.mjs            compare with expected.json
//   node wpt/run.mjs --write    write what happened as expected.json (to review: every entry needs a `means`)
//
// The harness is the specification's own (resources/testharness.js). Its report and the three pieces of testdriver the subset uses (bless, send_keys, click) are shims here: the keys and clicks are real, sent
// through the browser's input pipeline by Playwright, which is what `test_driver` does through WebDriver.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const here = new URL(".", import.meta.url).pathname;
const cache = join(here, ".cache");
const { tests, commit } = JSON.parse(readFileSync(join(here, "subset.json"), "utf8"));
const expectedFile = join(here, "expected.json");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const STATUS = ["PASS", "FAIL", "TIMEOUT", "NOTRUN", "PRECONDITION_FAILED"];

const SHIMS = {
  "/resources/testharnessreport.js": `
    add_completion_callback((subtests, harness) => { window.__wpt = { harness: harness.status, message: harness.message, tests: subtests.map((t) => ({ name: t.name, status: t.status, message: t.message })) }; });`,
  "/resources/testdriver.js": `
    window.test_driver = {
      bless: async (_name, fn) => { await window.__driver({ click: [2, 2] }); return typeof fn === "function" ? fn() : undefined; },
      send_keys: async (element, keys) => { element?.focus?.(); await window.__driver({ keys }); },
      click: async (element) => { const r = element.getBoundingClientRect(); await window.__driver({ click: [r.left + r.width / 2, r.top + r.height / 2] }); },
      set_test_context() {}, message_test() {},
    };`,
  "/resources/testdriver-vendor.js": "",
  "/resources/testdriver-actions.js": "",
};

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://x").pathname;

  if (path in SHIMS) {
    response.writeHead(200, { "content-type": "text/javascript" }).end(SHIMS[path]);

    return;
  }

  const file = normalize(join(cache, decodeURIComponent(path)));

  if (!file.startsWith(cache) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404).end();

    return;
  }

  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const port = server.address().port;
const executablePath = process.env["MESH_CHROMIUM"];
const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
const WEBDRIVER_KEYS = { "": "Escape", "": "Tab", "": "Enter", "": "Enter", "": " ", "": "ArrowDown", "": "ArrowUp" };
const actual = {};

for (const path of Object.keys(tests)) {
  const page = await browser.newPage();

  await page.exposeFunction("__driver", async (command) => {
    if (command.click !== undefined) {
      await page.mouse.click(command.click[0], command.click[1]);
    }

    if (command.keys !== undefined) {
      for (const key of [...command.keys]) {
        await page.keyboard.press(WEBDRIVER_KEYS[key] ?? key);
      }
    }
  });

  let result;

  try {
    await page.goto(`http://127.0.0.1:${port}/${path}`);
    await page.waitForFunction(() => window.__wpt !== undefined, null, { timeout: 30_000 });
    result = await page.evaluate(() => window.__wpt);
  } catch (error) {
    result = { harness: 2, message: String(error.message).slice(0, 120), tests: [] };
  }

  actual[path] = { harness: result.harness === 0 ? "OK" : `ERROR: ${result.message ?? ""}`.trim(), subtests: Object.fromEntries(result.tests.filter((each) => each.status !== 0).map((each) => [each.name, STATUS[each.status]])), passed: result.tests.filter((each) => each.status === 0).length, total: result.tests.length };
  await page.close();
}

const version = browser.version();

await browser.close();
server.close();

console.log(`Chromium ${version}, web-platform-tests ${commit.slice(0, 10)}`);

for (const [path, each] of Object.entries(actual)) {
  console.log(`${path.split("/").slice(-2).join("/").padEnd(62)} ${each.passed}/${each.total} ${each.harness}`);
}

if (process.argv.includes("--write")) {
  const written = Object.fromEntries(Object.entries(actual).map(([path, each]) => [path, { harness: each.harness, failing: each.subtests, means: "" }]));

  writeFileSync(expectedFile, `${JSON.stringify({ chromium: version, commit, tests: written }, null, 2)}\n`);
  process.exit(0);
}

const expected = JSON.parse(readFileSync(expectedFile, "utf8")).tests;
const differences = [];

for (const [path, each] of Object.entries(actual)) {
  const wanted = expected[path] ?? { harness: "OK", failing: {} };

  if (wanted.harness !== each.harness) differences.push(`${path}: harness ${each.harness}, expected ${wanted.harness}`);

  for (const [name, status] of Object.entries(each.subtests)) {
    if (wanted.failing[name] !== status) differences.push(`${path}: "${name}" is ${status}, expected ${wanted.failing[name] ?? "PASS"}`);
  }

  for (const name of Object.keys(wanted.failing)) {
    if (!(name in each.subtests)) differences.push(`${path}: "${name}" passes now: remove it from expected.json`);
  }
}

if (differences.length > 0) {
  console.error(differences.join("\n"));
  process.exit(1);
}

console.log("as expected");
