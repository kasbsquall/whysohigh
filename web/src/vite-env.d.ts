// Vite replaces import.meta.env at build time; the project's tsconfig only loads Node's types.
declare global {
  interface ImportMeta {
    readonly env: { readonly BASE_URL?: string; readonly VITE_STATIC_DEMO?: string };
  }
}
export {};
