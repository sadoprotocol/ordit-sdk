import * as ecc from "@bitcoinerlab/secp256k1";
import BIP32Factory from "bip32";
import { mnemonicToSeedSync } from "bip39";
import * as bitcoin from "bitcoinjs-lib";
import { isTaprootInput } from "bitcoinjs-lib/src/psbt/bip371";
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
  taprootPublicKey: string | null = null;
  allAddresses: ReturnType<typeof getAddressesFromPublicKey> = [];
  selectedAddressType: AddressFormats | undefined;
  selectedAddress: string | undefined;
  #taprootKeypair: ECPairInterface | null = null;

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
      const taprootChild = hdNodeToChild(hdNode, "taproot", 0);

      this.#keyPair = ECPair.fromPrivateKey(child.privateKey!, { network: networkObj });
      this.#taprootKeypair = ECPair.fromPrivateKey(taprootChild.privateKey!, { network: networkObj });
      this.taprootPublicKey = this.#taprootKeypair.publicKey.toString("hex");
    } else if (bip39) {
      const seedBuffer = mnemonicToSeedSync(bip39);
      const hdNode = bip32.fromSeed(seedBuffer, networkObj);
      const child = hdNodeToChild(hdNode, "legacy", 0);
      const taprootChild = hdNodeToChild(hdNode, "taproot", 0);

      this.#keyPair = ECPair.fromPrivateKey(child.privateKey!, { network: networkObj });
      this.#taprootKeypair = ECPair.fromPrivateKey(taprootChild.privateKey!, { network: networkObj });
      this.taprootPublicKey = this.#taprootKeypair.publicKey.toString("hex");
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
    this.publicKey = result.pub
    this.selectedAddressType = type;
  }

  signPsbt(hex?: string, base64?: string) {
    const networkObj = getNetwork(this.#network);
    let psbt: bitcoin.Psbt | null = null;

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

    const inputsToSign: Input[] = [];

    psbt.data.inputs.forEach((v, index) => {
      let script: any = null;

      if (v.witnessUtxo) {
        script = v.witnessUtxo.script;
      } else if (v.nonWitnessUtxo) {
        const tx = bitcoin.Transaction.fromBuffer(v.nonWitnessUtxo);
        const output = tx.outs[psbt!.txInputs[index].index];

        script = output.script;
      }
      const isSigned = v.finalScriptSig || v.finalScriptWitness;
      if (script && !isSigned) {
        const address = bitcoin.address.fromOutputScript(script, networkObj);
        if (this.selectedAddress === address) {
          inputsToSign.push({
            index,
            publicKey: this.publicKey,
            sighashTypes: v.sighashType ? [v.sighashType] : undefined
          });
        }
      }
    });

    for (let i = 0; i < inputsToSign.length; i++) {
      try {
        const input = psbt.data.inputs[i];

        if (isTaprootInput(input)) {
          if (!this.#taprootKeypair) {
            throw new Error("Taproot signer not found.");
          }

          const tweakedSigner = tweakSigner(this.#taprootKeypair, {
            network: networkObj
          });

          psbt.signInput(inputsToSign[i].index, tweakedSigner, inputsToSign[i].sighashTypes);
        } else {
          psbt.signInput(inputsToSign[i].index, this.#keyPair, inputsToSign[i].sighashTypes);
        }
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

  async getInscriptions() {
    if (!this.selectedAddress) {
      throw new Error("Wallet not fully initialized.");
    }

    return OrditApi.fetchAllInscriptions({
      address: this.selectedAddress,
      network: this.#network
    });
  }

  static inscription = {
    new: (options: OrdTransactionOptions) => new OrdTransaction(options),
    getInscriptionDetails: (outpoint: string, network: Network = "testnet") => {
      if (!outpoint) {
        throw new Error("Outpoint is required.");
      }

      return OrditApi.fetchInscriptionDetails({
        outpoint,
        network
      });
    }
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

function tweakSigner(signer: bitcoin.Signer, opts: any = {}): bitcoin.Signer {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey: Uint8Array | undefined = signer.privateKey!;
  if (!privateKey) {
    throw new Error("Private key is required for tweaking signer!");
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(privateKey, tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash));
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!");
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network
  });
}

function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoin.crypto.taggedHash("TapTweak", Buffer.concat(h ? [pubKey, h] : [pubKey]));
}

function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.subarray(1, 33);
}

export interface Input {
  index: number;
  publicKey: string;
  sighashTypes?: number[];
}
