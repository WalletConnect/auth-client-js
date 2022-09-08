# WalletConnect AuthClient

## Requirements

- Requires Node v16 to run tests due to [this issue with ethers + Node v17+](https://github.com/webpack/webpack/issues/14532).

## Commands

- `clean` - Removes build folders from all packages
- `lint` - Runs [eslint](https://eslint.org/) checks
- `prettier` - Runs [prettier](https://prettier.io/) checks
- `build` - Builds all packages
- `test` - Tests all packages
- `npm-publish` - Publishes packages to NPM. Requires an OTP code to be input on publish.

## Unit Tests

- The `vitest` test environment automatically pulls in the environment variables defined in `testEnv.json`
- These can be manually overridden by prefixing the desired custom vars: `TEST_PROJECT_ID=... yarn test`

## License

Apache 2.0
