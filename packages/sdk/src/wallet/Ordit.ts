import * as ecc from "@bitcoinerlab/secp256k1";
import BIP32Factory from "bip32";
import { mnemonicToSeedSync } from "bip39";
import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory, { ECPairInterface } from "ecpair";

import { AddressFormats, getAddressesFromPublicKey, getNetwork, hdNodeToChild } from "..";
import { OrditApi } from "../api";
import { Network } from "../config/types";
import { OrdTransaction, OrdTransactionOptions } from "../transactions";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

export class Ordit {
  #network: Network = "testnet";
  //   #config;
  #initialized = false;
  #keyPair: ECPairInterface;
  publicKey: string;
  allAddresses: ReturnType<typeof getAddressesFromPublicKey> = [];
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

  getAddressByType(type: AddressFormats) {
    if (!this.#initialized || !this.allAddresses.length) {
      throw new Error("Wallet not fully initialized.");
    }
    const result = this.allAddresses.find((address) => address.format === type);

    if (!result) {
      throw new Error(`Address of type ${type} not found in the instance.`);
    }

    return result;
  }

  getAllAddresses() {
    if (!this.#keyPair) {
      throw new Error("Keypair not found");
    }

    return getAddressesFromPublicKey(this.publicKey, this.#network, "all");
  }

  setDefaultAddress(type: AddressFormats) {
    if (this.selectedAddressType === type) return;

    const result = this.getAddressByType(type);

    this.selectedAddress = result.address;
    this.selectedAddressType = type;
  }

  signPsbt(hex?: string, base64?: string) {
    let psbt = null;

    if (!this.#keyPair || !this.#initialized) {
      throw new Error("Wallet not fully initialized.");
    }
    if (!(hex || base64) || (hex && base64)) {
      throw new Error("Invalid options provided.");
    }

    if (hex) {
      psbt = bitcoin.Psbt.fromHex(hex);
    }

    if (base64) {
      psbt = bitcoin.Psbt.fromBase64(base64);
    }

    if (!psbt || !psbt.inputCount) {
      throw new Error("Invalid PSBT provided.");
    }

    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        psbt.signInput(i, this.#keyPair);
      } catch (e) {
        throw new Error(e.message);
      }
    }

    const psbtHex = psbt.toHex();
    const psbtBase64 = psbt.toBase64();

    const psbtHasBeenSigned = psbtHex !== hex || psbtBase64 !== base64;

    if (psbtHasBeenSigned) {
      try {
        psbt.finalizeAllInputs();

        const signedHex = psbt.extractTransaction().toHex();

        return {
          hex: signedHex
        };
      } catch (error) {
        return {
          hex: psbtHex,
          base64: psbtBase64
        };
      }
    } else {
      throw new Error("Signed PSBT is same as input PSBT.");
    }
  }

  async relayTx(hex: string, network?: Network) {
    if (!hex) {
      throw new Error("Invalid options provided.");
    }

    const txResponse = await OrditApi.fetch<{ success: boolean; rdata: Array<any> }>("utxo/relay", {
      data: { hex },
      network: network ?? this.#network
    });

    if (!txResponse.success || !txResponse.rdata) {
      throw new Error("Failed to relay transaction.");
    }

    return {
      txid: txResponse.rdata
    };
  }

  static inscription = {
    new: (options: OrdTransactionOptions) => new OrdTransaction(options)
  };

  #initialize() {
    const addresses = this.getAllAddresses();
    this.allAddresses = addresses;

    const addressFormat = addresses[0].format as AddressFormats;
    this.selectedAddressType = addressFormat;
    this.selectedAddress = addresses[0].address;

    this.#initialized = true;
  }
}

export type WalletOptions = {
  wif?: string;
  seed?: string;
  privateKey?: string;
  bip39?: string;
  network?: Network;
};

export type Address = ReturnType<typeof getAddressesFromPublicKey>[0];
