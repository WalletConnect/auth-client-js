import { defineConfig } from "vitest/config";

// Node.js 16 is required to run the tests
const versionRegex = new RegExp(`^${16}\\..*`);
const versionCorrect = process.versions.node.match(versionRegex);
if (!versionCorrect) {
  throw Error(`Running on wrong Nodejs version. Please upgrade the node runtime to version ${16}`);
}

export default defineConfig({
  test: {
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
