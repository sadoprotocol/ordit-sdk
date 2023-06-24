import * as ecc from "@bitcoinerlab/secp256k1";
import BIP32Factory from "bip32";
import { entropyToMnemonic, mnemonicToSeed, validateMnemonic, wordlists } from "bip39";

import { Network } from "../config/types";
import { getNetwork } from "../utils";

export async function getWalletKeys(seedValue: string, network: Network = "testnet", path: string) {
  const { parent, mnemonic } = await getDerivedNode(seedValue, network, path);

  const pubKey = Buffer.from(parent.publicKey).toString("hex");
  const HD = parent.neutered().toBase58();

  return {
    pub: pubKey,
    hd: HD,
    bip39: mnemonic
  };
}

export async function getDerivedNode(seedValue: string, network: Network, path: string) {
  const bip32 = BIP32Factory(ecc);
  const isBip39 = validateMnemonic(seedValue);
  const networkObj = getNetwork(network);

  let seeds = null;

  if (isBip39) {
    seeds = await mnemonicToSeed(seedValue);
  } else {
    seeds = Buffer.from(seedValue, "hex");
  }

  const root = bip32.fromSeed(seeds, networkObj);
  const parent = root.derivePath(path);

  return {
    root,
    parent,
    mnemonic: isBip39 ? entropyToMnemonic(seeds, wordlists["english"]) : undefined
  };
}
