import * as ecc from "@bitcoinerlab/secp256k1";
import BIP32Factory from "bip32";
import { mnemonicToSeedSync } from "bip39";
import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory, { ECPairInterface } from "ecpair";

import {
  AddressFormats,
  AddressTypes,
  addressTypeToName,
  getAddressesFromPublicKey,
  getNetwork,
  hdNodeToChild
} from "..";
import { Network } from "../config/types";
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

export class Ordit {
  #network: Network = "testnet";
  //   #config;
  #keyPair: ECPairInterface;
  publicKey: string;
  allAddresses: ReturnType<typeof getAddressesFromPublicKey> | undefined;
  selectedAddressType: AddressFormats | undefined;
  selectedAddress: string | undefined;

  constructor({ wif, seed, privateKey, bip39, network = "testnet" }: WalletOptions) {
    this.#network = network;
    const networkObj = getNetwork(network);

    if (wif) {
      const keyPair = ECPair.fromWIF(wif, networkObj);
      this.#keyPair = keyPair;
    } else if (privateKey) {
      const pkBuffer = Buffer.from(privateKey, "hex");
      const keyPair = ECPair.fromPrivateKey(pkBuffer, { network: networkObj });
      this.#keyPair = keyPair;
    } else if (seed) {
      const seedBuffer = Buffer.from(seed, "hex");
      const hdNode = bip32.fromSeed(seedBuffer, networkObj);
      const child = hdNodeToChild(hdNode, "legacy", 0);

      this.#keyPair = ECPair.fromPrivateKey(child.privateKey!, { network: networkObj });
    } else if (bip39) {
      const seedBuffer = mnemonicToSeedSync(bip39);
      const hdNode = bip32.fromSeed(seedBuffer, networkObj);
      const child = hdNodeToChild(hdNode, "legacy", 0);

      this.#keyPair = ECPair.fromPrivateKey(child.privateKey!, { network: networkObj });
    } else if (privateKey) {
      const privateKeyBuffer = Buffer.from(privateKey, "hex");

      this.#keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network: networkObj });
    } else {
      throw new Error("Invalid options provided.");
    }

    this.publicKey = this.#keyPair.publicKey.toString("hex");

    this.#initialize();
  }

  get network() {
    return this.#network;
  }

  set network(value: Network) {
    this.#network = value;
  }

  #initialize() {
    const addresses = this.getAllAddresses();
    this.allAddresses = addresses;

    const addressFormat = addresses[0].format as AddressTypes;
    this.selectedAddressType = addressTypeToName[addressFormat];
    this.selectedAddress = addresses[0].address;
  }

  getAllAddresses() {
    if (!this.#keyPair) {
      throw new Error("Keypair not found");
    }

    return getAddressesFromPublicKey(this.publicKey, this.#network, "all");
  }
}

export type WalletOptions = {
  wif?: string;
  seed?: string;
  privateKey?: string;
  bip39?: string;
  network?: Network;
};
