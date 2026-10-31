/**
 * The Web PORT's native hatch, `@valancex/port-web/native`: an explicit way out of the portable layer (Provisional, Web only, not part of contract version 1).
 *
 * Pass a `Native` as `createWebPort`'s `native` option. Its callback for a component runs when an element of that primitive exists in the document: after `draw`, after an
 * insert by `update` or `patch`, and after `hydrate` adopts the server DOM. The cleanup it returns runs when that element ends (it is removed, replaced by another element or
 * another component at the key, or by `draw` or `unmount`), in the same call, after the PORT has handed focus off, and before any callback for what replaces it. The server
 * (`realizeHtml`) takes no `native`: a page is the same with or without it until the client runs.
 *
 * The hatch cannot change state. The callback gets the element and its key only: nothing that reports or dispatches, so state still changes only through the application's
 * commands. What the PORT owns on the element (its constant attributes, its props' attributes and properties, its group) is written back on the PORT's next write, so a change
 * the callback makes there lasts until then. Only a primitive marked `opaque` (which the tree gives no children) gives the callback the element's content, which hydration
 * leaves unverified and the PORT never touches. A layer can't be opaque.
 *
 * @packageDocumentation
 */

/** Sets up what the platform adds to one drawn element, and returns how to take it down. */
export type NativeSetup = (element: Element, info: { readonly key: string }) => (() => void) | void;

/** The native callback of each primitive that has one, by component name. */
export type Native = { readonly [component: string]: NativeSetup };
