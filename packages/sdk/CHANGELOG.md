# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## Fixed

- Handle float fee values using ceil function

## [0.0.5] - 2023-06-30

## Added

- OrdTransaction class to construct ordinals tx
- improvements to Ordit wallet class in terms of inscription

## [0.0.4] - 2023-06-29

### Added 

- Support signing PSBT using Ordit class
- Support TX relay using Ordit class
- Ability to get address by type ('Legacy' | 'Segwit' | 'Bech32' | 'Taproot')
- Ability to get all addresses
- Ability to set default address if a type provided  ('Legacy' | 'Segwit' | 'Bech32' | 'Taproot')

### Fixed

- validate xverse installed properly

## [0.0.3] - 2023-06-28

### Fixed

- star import bitcoinlib-js
- derive mnemonic properly with seed subarray
- properly confirm if a PSBT has been signed


## [0.0.2] - 2023-06-27

### Added

- Split ordinals content as chunks before building witness

### Fixed

- Return XVerse browser addresses correctly
- Make payload optional for Xverse `getAddresses` options

## [0.0.1] - 2023-06-26

### Added

- Support for Xverse, Unisat, MetaMask.
- Feature to sign messages and PSBTs.
- Feature to relay finalized PSBT to network.
- Feature to create PSBTs given inputs and outputs.
- Feature to get addresses and balances given PublicKey | seed | bip39 mnemonic.
- This change log file to highlight notable changes

[0.0.5]: https://github.com/sadoprotocol/ordit-sdk/compare/v0.0.3...v0.0.5
[0.0.4]: https://github.com/sadoprotocol/ordit-sdk/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/sadoprotocol/ordit-sdk/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/sadoprotocol/ordit-sdk/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/sadoprotocol/ordit-sdk/releases/tag/v0.0.1