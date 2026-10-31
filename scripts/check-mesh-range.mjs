// Runs the Web PORT's tests against each MESH version its peer range claims, not only the one the workspace installs: a range says what is allowed, this says what was tried.
//
//   node scripts/check-mesh-range.mjs [0.12.0 0.13.0 ...]
//
// With no argument it runs every minor `packages/port-web`'s `peerDependencies` range lists, so a range cannot claim a version this has not run.
//
// For each argument it installs `@valancex/mesh-compiler` and `@valancex/mesh-runtime` at that version into a scratch directory and runs `packages/port-web`'s suite with them (MESH_PACKAGES,
// see its vitest.config.ts). The vectors are the workspace's (the newest package carries the older ones unchanged: the values, events and identity vectors passed against 0.12 and 0.13 when this
// was written), except the program vectors (`program-vectors.test.ts`: enums, snippets, forwarder, passing), which use constructs MESH 0.14 introduced and run only against 0.14 and later.
// The composer's tests (`compose.test.ts`) drive a MESH screen (`openScreen`, MESH 0.18) and run only against 0.18 and later; `composeWebPort` itself imports nothing from MESH at run time.
// With `MESH_PACK_DIR` set, a version that is not published yet is installed from the packs in that directory (`valancex-mesh-compiler-<version>.tgz`, `valancex-mesh-runtime-<version>.tgz`), for a release that is
// prepared and not out. After `=` an argument may name a directory with another version of the `@valancex/mesh-conformance` package (unpacked), for a vector set of its own. Exit 1 if any run fails.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const run = (command, args, options) => spawnSync(command, args, { stdio: "inherit", ...options });
let failed = false;

const claimed = () => {
  const range = JSON.parse(readFileSync(join(root, "packages", "port-web", "package.json"), "utf8")).peerDependencies["@valancex/mesh-runtime"];

  return [...range.matchAll(/\^(\d+\.\d+\.\d+)/g)].map((match) => match[1]);
};

for (const argument of process.argv.length > 2 ? process.argv.slice(2) : claimed()) {
  const [version, conformance] = argument.split("=");
  const scratch = mkdtempSync(join(tmpdir(), `mesh-${version}-`));

  try {
    writeFileSync(join(scratch, "package.json"), '{"name":"scratch","private":true}');

    const packs = process.env["MESH_PACK_DIR"];
    const specs =
      packs !== undefined && existsSync(join(packs, `valancex-mesh-compiler-${version}.tgz`))
        ? [join(packs, `valancex-mesh-compiler-${version}.tgz`), join(packs, `valancex-mesh-runtime-${version}.tgz`)]
        : [`@valancex/mesh-compiler@${version}`, `@valancex/mesh-runtime@${version}`];

    if (run("npm", ["install", "--silent", ...specs], { cwd: scratch }).status !== 0) {
      throw new Error(`cannot install MESH ${version}`);
    }

    const env = { ...process.env, MESH_PACKAGES: scratch, ...(conformance === undefined ? {} : { MESH_CONFORMANCE: conformance }) };
    const vectors = conformance ?? join(root, "node_modules", "@valancex", "mesh-conformance");
    const program = existsSync(join(vectors, "conformance", "snippets")) && Number(version.split(".")[1]) >= 14;

    const screen = Number(version.split(".")[1]) >= 18;
    const notes = [...(program ? [] : ["the program vectors need 0.14"]), ...(screen ? [] : ["the composer needs 0.18"])];

    console.log(`\n== the Web PORT against MESH ${version}${notes.length === 0 ? "" : ` (${notes.join("; ")})`}`);

    const excluded = [...(program ? [] : ["test/program-vectors.test.ts"]), ...(screen ? [] : ["test/compose.test.ts"])];
    const result = run("npx", ["vitest", "run", ...excluded.flatMap((file) => ["--exclude", file])], { cwd: join(root, "packages", "port-web"), env });

    failed ||= result.status !== 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

process.exit(failed ? 1 : 0);
