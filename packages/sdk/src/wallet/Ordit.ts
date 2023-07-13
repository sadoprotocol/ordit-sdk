import * as ecc from "@bitcoinerlab/secp256k1";
import BIP32Factory from "bip32";
import { mnemonicToSeedSync } from "bip39";
import * as bitcoin from "bitcoinjs-lib";
import { isTaprootInput } from "bitcoinjs-lib/src/psbt/bip371";
import { sign } from "bitcoinjs-message";
import ECPairFactory, { ECPairInterface } from "ecpair";

import {
  Account,
  AddressFormats,
  addressNameToType,
  generateBuyerPsbt,
  generateDummyUtxos,
  generateSellerPsbt,
  getAddressesFromPublicKey,
  getAllAccountsFromHdNode,
  getNetwork,
  mintFromCollection,
  publishCollection,
  tweakSigner
} from "..";
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
  allAddresses: ReturnType<typeof getAddressesFromPublicKey> | ReturnType<typeof getAllAccountsFromHdNode> = [];
  selectedAddressType: AddressFormats | undefined;
  selectedAddress: string | undefined;

  constructor({ wif, seed, privateKey, bip39, network = "testnet", type = "legacy" }: WalletOptions) {
    this.#network = network;
    const networkObj = getNetwork(network);
    const format = addressNameToType[type];

    if (wif) {
      const keyPair = ECPair.fromWIF(wif, networkObj);
      this.#keyPair = keyPair;

      this.publicKey = keyPair.publicKey.toString("hex");

      const accounts = getAddressesFromPublicKey(keyPair.publicKey, network, format);
      this.#initialize(accounts);
    } else if (privateKey) {
      const pkBuffer = Buffer.from(privateKey, "hex");
      const keyPair = ECPair.fromPrivateKey(pkBuffer, { network: networkObj });
      this.#keyPair = keyPair;

      this.publicKey = keyPair.publicKey.toString("hex");

      const accounts = getAddressesFromPublicKey(keyPair.publicKey, network, format);
      this.#initialize(accounts);
    } else if (seed) {
      const seedBuffer = Buffer.from(seed, "hex");
      const hdNode = bip32.fromSeed(seedBuffer, networkObj);

      const accounts = getAllAccountsFromHdNode({ hdNode, network });

      const pkBuf = Buffer.from(accounts[0].priv, "hex");
      this.#keyPair = ECPair.fromPrivateKey(pkBuf, { network: networkObj });

      this.publicKey = this.#keyPair.publicKey.toString("hex");

      this.#initialize(accounts);
    } else if (bip39) {
      const seedBuffer = mnemonicToSeedSync(bip39);
      const hdNode = bip32.fromSeed(seedBuffer, networkObj);

      const accounts = getAllAccountsFromHdNode({ hdNode, network });

      const pkBuf = Buffer.from(accounts[0].priv, "hex");
      this.#keyPair = ECPair.fromPrivateKey(pkBuf, { network: networkObj });

      this.publicKey = this.#keyPair.publicKey.toString("hex");

      this.#initialize(accounts);
    } else {
      throw new Error("Invalid options provided.");
    }
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

    return this.allAddresses;
  }

  setDefaultAddress(type: AddressFormats) {
    if (this.selectedAddressType === type) return;

    const result = this.getAddressByType(type) as Account;
    const networkObj = getNetwork(this.#network);

    this.selectedAddress = result.address;
    this.publicKey = result.pub;
    this.selectedAddressType = type;

    if (result.priv) {
      this.#keyPair = ECPair.fromPrivateKey(Buffer.from(result.priv, "hex"), {
        network: networkObj
      });
    }
  }

  signPsbt(value: string, { finalized = true }: { finalized?: boolean }) {
    const networkObj = getNetwork(this.#network);
    let psbt: bitcoin.Psbt | null = null;

    if (!this.#keyPair || !this.#initialized) {
      throw new Error("Wallet not fully initialized.");
    }

    try {
      psbt = bitcoin.Psbt.fromHex(value);
    } catch (error) {
      psbt = bitcoin.Psbt.fromBase64(value);
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

    if (!inputsToSign.length) {
      throw new Error("Cannot sign PSBT with no signable inputs.");
    }

    let psbtHasBeenSigned = false;

    for (let i = 0; i < inputsToSign.length; i++) {
      try {
        const input = psbt.data.inputs[i];
        psbtHasBeenSigned = input.finalScriptSig || input.finalScriptWitness ? true : false;

        if (psbtHasBeenSigned) continue;

        if (isTaprootInput(input)) {
          const tweakedSigner = tweakSigner(this.#keyPair, {
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

    //TODO: check if psbt has been signed

    try {
      if (finalized) {
        psbt.finalizeAllInputs();

        const signedHex = psbt.extractTransaction().toHex();

        return signedHex;
      }

      return psbtHex;
    } catch (error) {
      throw new Error("Cannot finalize the inputs.", error);
    }
  }

  signMessage(message: string) {
    const signature = sign(message, this.#keyPair.privateKey!);

    return signature.toString("base64");
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

  static instantBuy = {
    generateBuyerPsbt,
    generateSellerPsbt,
    generateDummyUtxos
  };

  static collection = {
    publish: publishCollection,
    mint: mintFromCollection
  };

  #initialize(addresses: Address[]) {
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
  type?: AddressFormats;
};

export type Address = ReturnType<typeof getAddressesFromPublicKey>[0];

export interface Input {
  index: number;
  publicKey: string;
  sighashTypes?: number[];
}
