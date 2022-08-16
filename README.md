# WalletConnect AuthClient

## Requirements

- Requires Node v16 to run tests due to [this issue with ethers + Node v17+](https://github.com/webpack/webpack/issues/14532).

## Commands

- `clean` - Removes build folders from all packages
- `lint` - Runs [eslint](https://eslint.org/) checks
- `prettier` - Runs [prettier](https://prettier.io/) checks
- `build` - Builds all packages
- `test` - Tests all packages

## Unit Tests

- The unit tests depend on a relay server being run locally on port `5555`.
- Before running tests, pull and start ts-relay server ([separate repo](https://github.com/WalletConnect/ts-relay)) `PORT=5555 npm run start` in a separate terminal window

## License

Apache 2.0
