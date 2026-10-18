// MESH's conformance vectors, from the package that carries them
// (`@valancex/mesh-conformance`, a development dependency of the workspace),
// never from a copy in this tree. `scripts/check-conformance.mjs` (run by
// `test/vectors.test.ts`) fails if a copy appears, or if the installed package
// is older than the version `conformance.json` says this repository supports.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const packageJson = require.resolve("@valancex/mesh-conformance/package.json");

/** The directory of the vectors: `values/`, `events/`, `identity/`, `components.json`. */
export const vectors = pathToFileURL(join(dirname(packageJson), "conformance") + "/");
