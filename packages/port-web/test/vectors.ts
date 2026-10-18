// MESH's conformance vectors, from the package that carries them
// (`@valancex/mesh-conformance`, a development dependency of the workspace),
// never from a copy in this tree. `scripts/check-conformance.mjs` (run by
// `test/vectors.test.ts`) fails if a copy appears, or if the installed package
// is older than the version `conformance.json` says this repository supports.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
// MESH_CONFORMANCE names a directory with another version of the package (scripts/check-mesh-range.mjs), to run the suite against the vectors that version had.
const packageJson = process.env.MESH_CONFORMANCE === undefined ? require.resolve("@valancex/mesh-conformance/package.json") : join(process.env.MESH_CONFORMANCE, "package.json");

/** The directory of the vectors: `values/`, `events/`, `identity/`, `components.json`. */
export const vectors = pathToFileURL(join(dirname(packageJson), "conformance") + "/");
