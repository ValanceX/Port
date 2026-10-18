// Runs the Web PORT's tests against each MESH version its peer range claims, not only the one the workspace installs: a range says what is allowed, this says what was tried.
//
//   node scripts/check-mesh-range.mjs 0.13.0=<conformance dir> 0.14.0
//
// For each argument it installs `@valancex/mesh-compiler` and `@valancex/mesh-runtime` at that version into a scratch directory and runs `packages/port-web`'s suite with them (MESH_PACKAGES,
// see its vitest.config.ts). After `=` is a directory holding that MESH version's `@valancex/mesh-conformance` package (unpacked), for a version whose vectors differ from the workspace's; without it
// the workspace's vectors are used. The program vectors (`program-vectors.test.ts`) are run only when the vectors have a `snippets/` directory (MESH 0.14 added them).
// Exit 1 if any run fails.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const run = (command, args, options) => spawnSync(command, args, { stdio: "inherit", ...options });
let failed = false;

for (const argument of process.argv.slice(2)) {
  const [version, conformance] = argument.split("=");
  const scratch = mkdtempSync(join(tmpdir(), `mesh-${version}-`));

  try {
    writeFileSync(join(scratch, "package.json"), '{"name":"scratch","private":true}');

    if (run("npm", ["install", "--silent", `@valancex/mesh-compiler@${version}`, `@valancex/mesh-runtime@${version}`], { cwd: scratch }).status !== 0) {
      throw new Error(`cannot install MESH ${version}`);
    }

    const env = { ...process.env, MESH_PACKAGES: scratch, ...(conformance === undefined ? {} : { MESH_CONFORMANCE: conformance }) };
    const vectors = conformance ?? join(root, "node_modules", "@valancex", "mesh-conformance");
    const program = existsSync(join(vectors, "conformance", "snippets"));

    console.log(`\n== the Web PORT against MESH ${version}${program ? "" : " (vectors without program cases)"}`);

    const result = run("npx", ["vitest", "run", ...(program ? [] : ["--exclude", "test/program-vectors.test.ts"])], { cwd: join(root, "packages", "port-web"), env });

    failed ||= result.status !== 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

process.exit(failed ? 1 : 0);
