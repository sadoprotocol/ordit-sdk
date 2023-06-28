import * as ecc from "@bitcoinerlab/secp256k1";
import { BIP32Interface } from "bip32";
import * as bitcoin from "bitcoinjs-lib";

import { AddressFormats, AddressTypes } from "../addresses/formats";
import { Network } from "../config/types";
import { DERIVATION_PATHS_WITHOUT_INDEX } from "./constants";

export function getNetwork(value: Network) {
  if (value === "mainnet") {
    return bitcoin.networks["bitcoin"];
  }

  return bitcoin.networks[value];
}

export function createTransaction(
  key: Buffer,
  type: AddressTypes,
  network: Network | bitcoin.Network,
  paymentOptions?: bitcoin.Payment
) {
  bitcoin.initEccLib(ecc);
  const networkObj = typeof network === "string" ? getNetwork(network) : network;

  if (type === "p2tr") {
    return bitcoin.payments.p2tr({ internalPubkey: key, network: networkObj, ...paymentOptions });
  }

  if (type === "p2sh") {
    return bitcoin.payments.p2sh({
      redeem: bitcoin.payments.p2wpkh({ pubkey: key, network: networkObj }),
      network: networkObj
    });
  }

  return bitcoin.payments[type]({ pubkey: key, network: networkObj });
}

export function hdNodeToChild(node: BIP32Interface, formatType: AddressFormats = "legacy", index = 0) {
  const fullDerivationPath = DERIVATION_PATHS_WITHOUT_INDEX[formatType] + index;

  return node.derivePath(fullDerivationPath);
}
