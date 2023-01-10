import { defineConfig } from "vitest/config";

// Node.js 16 is required to run the tests
const versionRegex = new RegExp(`^${16}\\..*`);
const versionCorrect = process.versions.node.match(versionRegex);
if (!versionCorrect) {
  throw Error(`Running on wrong Nodejs version. Please use node version 16.x`);
}

export default defineConfig({
  test: {
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
