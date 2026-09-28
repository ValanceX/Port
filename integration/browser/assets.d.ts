// Vite resolves `?url` imports to the asset's URL (used for mesh-runtime.wasm).
declare module "*?url" {
  const url: string;
  export default url;
}
