import { AddressFormats } from "..";

export const DERIVATION_PATHS_WITHOUT_INDEX: Record<AddressFormats, string> = {
  legacy: `m/44'/0'/0'/0/`,
  segwit: `m/49'/0'/0'/0/`,
  bech32: `m/84'/0'/0'/0/`,
  taproot: `m/86'/0'/0'/0/`
};
