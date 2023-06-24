import * as ecc from "@bitcoinerlab/secp256k1";
import bitcoin, { Network as BitcoinNetwork, networks } from "bitcoinjs-lib";

import { AddressTypes } from "../addresses/formats";
import { Network } from "../config/types";

export function getNetwork(value: Network) {
  if (value === "mainnet") {
    return networks["bitcoin"];
  }

  return networks[value];
}

export function createTransaction(key: Buffer, type: AddressTypes, network: Network | BitcoinNetwork) {
  bitcoin.initEccLib(ecc);
  const networkObj = typeof network === "string" ? getNetwork(network) : network;

  if (type === "p2tr") {
    return bitcoin.payments.p2tr({ internalPubkey: key, network: networkObj });
  }

  if (type === "p2sh") {
    return bitcoin.payments.p2sh({
      redeem: bitcoin.payments.p2wpkh({ pubkey: key, network: networkObj }),
      network: networkObj
    });
  }

  return bitcoin.payments[type]({ pubkey: key, network: networkObj });
}
