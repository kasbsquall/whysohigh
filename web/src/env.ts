// Build switches. scripts/build-static.ts sets them for the online copy, which
// replays a recorded run from demo.json and cannot read new photos.
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === "true";
export const BASE = import.meta.env.BASE_URL ?? "/";
