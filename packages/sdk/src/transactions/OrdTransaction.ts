import * as ecc from "@bitcoinerlab/secp256k1";
import * as bitcoin from "bitcoinjs-lib";

import { buildWitnessScript, createTransaction, getAddressesFromPublicKey, getNetwork, OrditApi } from "..";
import { Network } from "../config/types";

bitcoin.initEccLib(ecc);

export class OrdTransaction {
  publicKey: string;
  feeRate: number;
  postage: number;
  mediaType: string;
  mediaContent: string;
  destinationAddress: string;
  changeAddress: string;
  meta: object | unknown;
  network: Network;
  psbt: bitcoin.Psbt | null = null;
  ready = false;
  #xKey: string;
  #feeForWitnessData: number | null = null;
  #commitAddress: string | null = null;
  #inscribePayTx: ReturnType<typeof createTransaction> | null = null;
  #suitableUnspent: any = null;

  constructor({
    feeRate = 10,
    postage = 10000,
    mediaType = "text/plain;charset=utf-8",
    network = "testnet",
    publicKey,
    ...otherOptions
  }: OrdTransactionOptions) {
    if (!publicKey || !otherOptions.changeAddress || !otherOptions.destination || !otherOptions.mediaContent) {
      throw new Error("Invalid options provided.");
    }

    this.publicKey = publicKey;
    this.feeRate = feeRate;
    this.mediaType = mediaType;
    this.network = network;
    this.changeAddress = otherOptions.changeAddress;
    this.destinationAddress = otherOptions.destination;
    this.mediaContent = otherOptions.mediaContent;
    this.meta = otherOptions.meta;
    this.postage = postage;

    const xKey = getAddressesFromPublicKey(publicKey, network, "p2tr")[0].xkey;

    if (!xKey) {
      throw new Error("Failed to derive xKey from the provided public key.");
    }

    this.#xKey = xKey;
  }

  build() {
    if (!this.#suitableUnspent || !this.#inscribePayTx) {
      throw new Error("Failed to build PSBT. Transaction not ready.");
    }

    const fees = this.postage + this.#feeForWitnessData!;
    const change = this.#suitableUnspent.sats - fees;

    const networkObj = getNetwork(this.network);

    const psbt = new bitcoin.Psbt({ network: networkObj });

    try {
      psbt.addInput({
        hash: this.#suitableUnspent.txid,
        index: parseInt(this.#suitableUnspent.n),
        tapInternalKey: Buffer.from(this.#xKey, "hex"),
        witnessUtxo: {
          script: this.#inscribePayTx.output!,
          value: parseInt(this.#suitableUnspent.sats)
        },
        tapLeafScript: [
          {
            leafVersion: this.#inscribePayTx.redeemVersion!,
            script: this.#inscribePayTx.redeem!.output!,
            controlBlock: this.#inscribePayTx.witness![this.#inscribePayTx.witness!.length - 1]
          }
        ]
      });

      psbt.addOutput({
        address: this.destinationAddress,
        value: this.postage
      });

      if (change > 600) {
        let changeAddress = this.#inscribePayTx.address;
        if (this.changeAddress) {
          changeAddress = this.changeAddress;
        }

        psbt.addOutput({
          address: changeAddress!,
          value: change
        });
      }

      this.psbt = psbt;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  toPsbt() {
    if (!this.psbt) {
      throw new Error("No PSBT found. Please build first.");
    }

    return this.psbt;
  }

  toHex() {
    if (!this.psbt) {
      throw new Error("No PSBT found. Please build first.");
    }

    return this.psbt.toHex();
  }

  toBase64() {
    if (!this.psbt) {
      throw new Error("No PSBT found. Please build first.");
    }

    return this.psbt.toBase64();
  }

  generateCommit() {
    const witnessScript = buildWitnessScript({
      mediaContent: this.mediaContent,
      mediaType: this.mediaType,
      meta: this.meta,
      xkey: this.#xKey
    });

    if (!witnessScript) {
      throw new Error("Failed to build createRevealPsbt");
    }

    const scriptTree = {
      output: witnessScript
    };

    const redeemScript = {
      output: witnessScript,
      redeemVersion: 192
    };

    const inscribePayTx = createTransaction(Buffer.from(this.#xKey, "hex"), "p2tr", this.network, {
      scriptTree: scriptTree,
      redeem: redeemScript
    });

    const fees = JSON.parse(JSON.stringify((80 + 1 * 180) * this.feeRate));
    const scriptLength = witnessScript.toString("hex").length;
    const scriptFees = Math.ceil((scriptLength / 10) * this.feeRate + fees);

    this.#feeForWitnessData = scriptFees;
    this.#commitAddress = inscribePayTx.address!;
    this.#inscribePayTx = inscribePayTx;

    return {
      address: inscribePayTx.address!,
      revealFee: this.postage + scriptFees
    };
  }

  async isReady() {
    if (!this.#commitAddress || !this.#feeForWitnessData) {
      throw new Error("No commit address found. Please generate a commit address.");
    }

    if (!this.ready) {
      try {
        await this.fetchAndSelectSuitableUnspent();
      } catch (error) {
        return false;
      }
    }

    return this.ready;
  }

  async fetchAndSelectSuitableUnspent() {
    if (!this.#commitAddress || !this.#feeForWitnessData) {
      throw new Error("No commit address found. Please generate a commit address.");
    }

    const unspentsResponse = await OrditApi.fetch<{
      success: boolean;
      rdata: Array<any>;
      message?: string;
    }>("utxo/unspents", {
      data: {
        address: this.#commitAddress,
        options: {
          txhex: true,
          notsafetospend: false,
          allowedrarity: ["common"]
        }
      },
      network: this.network
    });

    if (!unspentsResponse.success) {
      throw new Error(unspentsResponse.message);
    }

    const unspents = unspentsResponse.rdata;

    const suitableUnspent = unspents.find((unspent) => {
      if (unspent.sats >= this.postage + this.#feeForWitnessData! && unspent.safeToSpend === true) {
        return true;
      }
    }, this);

    if (!suitableUnspent) {
      throw new Error("No suitable unspent found for reveal.");
    }

    this.#suitableUnspent = suitableUnspent;
    this.ready = true;

    return suitableUnspent;
  }
}

export type OrdTransactionOptions = {
  feeRate?: number;
  postage?: number;
  mediaType?: string;
  mediaContent: string;
  destination: string;
  changeAddress: string;
  meta?: object | unknown;
  network?: Network;
  publicKey: string;
};