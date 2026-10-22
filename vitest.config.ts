import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "engines/*/reference/test/**/*.test.ts"],
  },
});
