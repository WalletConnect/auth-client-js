# WalletConnect AuthClient

## Requirements

- Requires Node v16 to run tests due to [this issue with ethers + Node v17+](https://github.com/webpack/webpack/issues/14532).

## Installation

```sh
npm install
```

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

## Publishing

1. Bump the version for the specific package and create the equivalent tag, e.g. for a patch:

```sh
cd packages/auth-client
npm version patch # will update package.json and package-lock.json
git commit -m "chore(release): 2.x.x"
git tag 2.x.x
```

2. Run the desired `npm-publish` script from the root directory:

```sh
npm run npm-publish # will auto-trigger each pkg's prepare/prepublishOnly scripts
```

#### Publishing Canaries

To publish canary versions under the `canary` dist tag, follow the same steps as above, but set the version using 
the last commit's short hash (`git log --oneline | head -n1`), e.g. if the current version is `2.2.2`:

```sh
# ...
npm version 2.2.2-bb147cb
# ...
```

Then from the root directory, run:

```sh
npm run npm-publish:canary # will auto-trigger each pkg's prepare/prepublishOnly scripts
```



## License

Apache 2.0
