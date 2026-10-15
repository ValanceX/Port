// The crate's files are the one source of the vocabulary; this package carries a copy so it can be published (a package cannot reach outside its own directory). The copy is made before every
// pack and every test, is not committed, and the test below checks it is the crate's.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

for (const file of ["vocabulary.json", "content.json"]) {
  copyFileSync(here(`../../port-desktop/${file}`), here(`../${file}`));
}
