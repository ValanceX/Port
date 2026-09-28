// Build time, in Node: MPRX → template-v1 with the published MESH compiler, exactly
// as the jsdom slice does (../test/app.ts). The browser never compiles MPRX; it
// receives the compiled program, as a real application's bundle would.
import type { TestProject } from "vitest/node";

import { compileProgram, expectedFirstHtml, readJson } from "../test/app.js";

export default async function setup(project: TestProject): Promise<void> {
  project.provide("slice", {
    program: await compileProgram(),
    snapshots: { first: readJson("snapshots/first.json"), second: readJson("snapshots/second.json") },
    intent: readJson("expected/select-first.intent.json"),
    firstHtml: expectedFirstHtml,
    // The update users.refresh causes: the first user becomes second.json's Ada King (as in ../test/slice.test.ts).
    updatedHtml: expectedFirstHtml
      .replace('aria-label="Ada Lovelace"', 'aria-label="Ada King"')
      .replace('alt="Ada Lovelace" data-size="sm" src="ada.png"', 'alt="Ada King" data-size="sm" src="ada-2.png"')
      .replace("<span>Ada Lovelace</span>", "<span>Ada King</span>"),
  });
}

declare module "vitest" {
  export interface ProvidedContext {
    slice: {
      readonly program: { readonly root: string; readonly templates: ReadonlyArray<string>; readonly model: string };
      readonly snapshots: { readonly first: unknown; readonly second: unknown };
      readonly intent: unknown;
      readonly firstHtml: string;
      readonly updatedHtml: string;
    };
  }
}
