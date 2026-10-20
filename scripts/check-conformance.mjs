// The check of decision Q2 (Bet 2): MESH's conformance vectors come from the
// published package and are never copied. It fails (exit 1) if
//
//   1. a copy of the vectors exists anywhere in this tree: a file whose path ends with one of the
//      package's vector files (`values/cases.json`, `identity/repeat/cases.json`, ...), whatever its
//      contents (identical, or a copy that has drifted), outside node_modules, or
//   2. the installed package is older than the version `conformance.json` says this repository
//      supports (or is not installed).
//
//   node scripts/check-conformance.mjs [root]
//
// `check` is exported for the tests, which plant a copy to see it fail.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKIP = new Set(["node_modules", ".git", "target", "dist"]);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const path = join(dir, entry.name);

    return entry.isDirectory() ? walk(path) : [path];
  });
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const posix = (path) => path.split(sep).join("/");
const parse = (version) => version.split("-")[0].split(".").map(Number);
/** a < b, for plain `major.minor.patch`. */
const older = (a, b) => {
  const [x, y] = [parse(a), parse(b)];

  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  }

  return false;
};

/**
 * @param {string} root the repository to check
 * @param {{ packageDir?: string }} [options] the installed package's directory (found from `root` by default)
 * @returns {string[]} what is wrong; empty when the check passes
 */
export const check = (root, options = {}) => {
  const problems = [];
  const claim = JSON.parse(readFileSync(join(root, "conformance.json"), "utf8"));
  let packageDir = options.packageDir;

  if (packageDir === undefined) {
    try {
      packageDir = dirname(createRequire(pathToFileURL(join(root, "package.json"))).resolve(`${claim.package}/package.json`));
    } catch {
      problems.push(`${claim.package} is not installed: run pnpm install`);

      return problems;
    }
  }

  const installed = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).version;

  if (older(installed, claim.supports)) {
    problems.push(`${claim.package} ${installed} is installed, older than the ${claim.supports} this repository supports (conformance.json)`);
  }

  // The package's vector files, by path inside conformance/. Only files in a subdirectory are matched on
  // their own (components.json and README.md are common names).
  const vectorRoot = join(packageDir, "conformance");
  const vectors = new Map(walk(vectorRoot).map((path) => [posix(relative(vectorRoot, path)), sha(path)]));
  const nested = [...vectors].filter(([path]) => path.includes("/"));
  const copies = [];

  for (const path of walk(root)) {
    const inTree = posix(relative(root, path));

    for (const [name, hash] of nested) {
      if (inTree === name || inTree.endsWith(`/${name}`)) {
        copies.push(`${inTree} is a ${sha(path) === hash ? "copy of" : "drifted copy of"} the vector ${name}`);
      }
    }
  }

  if (copies.length > 0) {
    problems.push(`a copy of the conformance vectors exists in this tree (read them from ${claim.package}, never copy them):`, ...copies.map((line) => `  ${line}`));
  }

  return problems;
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
  const problems = check(root);

  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }

  console.log("conformance vectors: no copy in the tree, and the installed package is new enough");
}

