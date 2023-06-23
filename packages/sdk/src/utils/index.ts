import * as ecc from "@bitcoinerlab/secp256k1";
import bitcoin, { networks } from "bitcoinjs-lib";

import { AddressTypes } from "../addresses/formats";
import { Network } from "../config/types";

export function getNetwork(value: Network) {
  if (value === "mainnet") {
    return networks["bitcoin"];
  }

  return networks[value];
}

export function createTransaction(key: Buffer, type: AddressTypes, network: Network) {
  bitcoin.initEccLib(ecc);
  const networkObj = getNetwork(network);

  if (type === "p2tr") {
    return bitcoin.payments.p2tr({ internalPubkey: key, network: networkObj });
  }

  return bitcoin.payments[type]({ pubkey: key, network: networkObj });
}
