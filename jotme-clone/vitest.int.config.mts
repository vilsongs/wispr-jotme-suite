import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/*.int.test.ts"],
    environment: "node",
  },
});
