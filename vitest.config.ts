import { defineConfig } from "vitest/config";
import testEnv from "./testEnv.json";

export default defineConfig({
  test: {
    env: {
      ...testEnv,
    },
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
