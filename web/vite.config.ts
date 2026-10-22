// Vite serves the page in development and proxies /api to the Node server (npm run serve).
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  server: { host: "127.0.0.1", port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
  build: { outDir: "dist", emptyOutDir: true },
});
