import * as bitcoin from "bitcoinjs-lib";

import {
  AddressFormats,
  addressNameToType,
  AddressTypes,
  calculateTxFeeWithRate,
  createTransaction,
  getAddressesFromPublicKey,
  getNetwork,
  OrditApi
} from "..";
import { Network } from "../config/types";

export async function generateSellerInstantBuyPsbt({
  inscriptionId,
  price,
  receiveAddress,
  publicKey,
  pubKeyType = "taproot",
  network = "testnet"
}: GenerateSellerInstantBuyPsbtOptions) {
  const { inputs, outputs } = await getSellerInputsOutputs({
    inscriptionId,
    price,
    receiveAddress,
    publicKey,
    pubKeyType,
    network
  });

  const networkObj = getNetwork("testnet");
  const psbt = new bitcoin.Psbt({ network: networkObj });

  psbt.addInput(inputs[0]);
  psbt.addOutput(outputs[0]);

  return psbt;
}

export async function generateBuyerInstantBuyPsbt({
  publicKey,
  pubKeyType = "legacy",
  feeRate = 10,
  network = "testnet",
  sellerData
}: GenerateBuyerInstantBuyPsbtOptions) {
  const networkObj = getNetwork(network);
  const format = addressNameToType[pubKeyType];
  const address = getAddressesFromPublicKey(publicKey, network, format)[0];

  const unspentsResponse = await OrditApi.fetch<{
    success: boolean;
    rdata: Array<any>;
    message?: string;
  }>("utxo/unspents", {
    data: {
      address: address.address,
      options: {
        txhex: true,
        notsafetospend: false,
        allowedrarity: ["common"]
      }
    },
    network
  });

  if (!unspentsResponse.success) {
    throw new Error(unspentsResponse.message);
  }

  if (!unspentsResponse.rdata.length) {
    throw new Error("No UTXOs found.");
  }

  const psbt = new bitcoin.Psbt({ network: networkObj });
  const utxos = unspentsResponse.rdata;
  const dummyUtxos = [];
  const spendableUtxos = [];

  //find dummy utxos
  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i];

    if (utxo.inscriptions.length > 0) {
      continue;
    }

    if (utxo.sats >= 580 && utxo.sats <= 1000) {
      dummyUtxos.push(utxo);
    } else {
      spendableUtxos.push(utxo);
    }
  }

  if (dummyUtxos.length < 2 || !spendableUtxos.length) {
    throw new Error("No suitable UTXOs found.");
  }

  let totalInput = 0;

  for (let i = 0; i < 2; i++) {
    const dummyUtxo = dummyUtxos[i];
    const tx = await OrditApi.fetch<{
      success: boolean;
      rdata: any;
      message?: string;
    }>("utxo/transaction", {
      data: {
        txid: dummyUtxo.txid,
        options: {
          noord: false,
          nohex: false,
          nowitness: false
        }
      },
      network
    });

    if (!tx.success) {
      throw new Error("Failed to get raw transaction for id: " + dummyUtxo.txid);
    }

    const rawTx = bitcoin.Transaction.fromHex(tx.rdata?.hex);
    if (format !== "p2tr") {
      for (const output in rawTx.outs) {
        try {
          rawTx.setWitness(parseInt(output), []);
        } catch {}
      }
    }
    const input: any = {
      hash: dummyUtxo.txid,
      index: dummyUtxo.n,
      nonWitnessUtxo: rawTx.toBuffer(),
      witnessUtxo: format === "p2tr" ? rawTx.outs[0] : undefined,
      tapInternalKey: format === "p2tr" ? Buffer.from(address.xkey!, "hex") : undefined
    };

    const p2shInputRedeemScript: any = {};
    const p2shInputWitnessUTXO: any = {};

    if (format === "p2sh") {
      const p2sh = createTransaction(Buffer.from(publicKey, "hex"), format, network);
      p2shInputWitnessUTXO.witnessUtxo = {
        script: p2sh.output,
        value: dummyUtxo.sats
      };
      p2shInputRedeemScript.redeemScript = p2sh.redeem?.output;
    }

    psbt.addInput({
      ...input,
      ...p2shInputWitnessUTXO,
      ...p2shInputRedeemScript
    });
    totalInput += dummyUtxo.sats;
  }

  // Add dummy output
  psbt.addOutput({
    address: address.address!,
    value: dummyUtxos[0].sats + dummyUtxos[1].sats + 0
  });

  // Add ordinal output
  psbt.addOutput({
    address: address.address!,
    value: 1000
  });

  const { inputs, outputs } = await getSellerInputsOutputs({ ...sellerData, side: "buyer" });

  psbt.addInput(inputs[0]);
  psbt.addOutput(outputs[0]);

  for (let i = 0; i < spendableUtxos.length; i++) {
    const utxo = spendableUtxos[i];

    const tx = await OrditApi.fetch<{
      success: boolean;
      rdata: any;
      message?: string;
    }>("utxo/transaction", {
      data: {
        txid: utxo.txid,
        options: {
          noord: false,
          nohex: false,
          nowitness: false
        }
      },
      network
    });

    const rawTx = bitcoin.Transaction.fromHex(tx.rdata?.hex);
    if (format !== "p2tr") {
      for (const output in rawTx.outs) {
        try {
          rawTx.setWitness(parseInt(output), []);
        } catch {}
      }
    }
    const input: any = {
      hash: utxo.txid,
      index: utxo.n,
      nonWitnessUtxo: rawTx.toBuffer(),
      witnessUtxo: rawTx.outs[2]
    };

    psbt.addInput({
      ...input
    });

    totalInput += utxo.sats;
  }

  const fee = calculateTxFeeWithRate(psbt.txInputs.length, psbt.txOutputs.length, feeRate);
  const totalOutput = psbt.txOutputs.reduce((partialSum, a) => partialSum + a.value, 0);

  const changeValue = totalInput - totalOutput - fee;
  if (changeValue < 0) {
    throw new Error("Insufficient funds to buy this inscription");
  }

  if (changeValue > 580) {
    psbt.addOutput({
      address: address.address!,
      value: changeValue
    });
  }

  return psbt;
}

export async function generateDummyUtxos({
  publicKey,
  feeRate = 10,
  pubKeyType = "taproot",
  network = "testnet"
}: GenerateDummyUtxos) {
  const networkObj = getNetwork(network);
  const format = addressNameToType[pubKeyType];
  const address = getAddressesFromPublicKey(publicKey, network, format)[0];

  const unspentsResponse = await OrditApi.fetch<{
    success: boolean;
    rdata: Array<any>;
    message?: string;
  }>("utxo/unspents", {
    data: {
      address: address.address,
      options: {
        txhex: true,
        notsafetospend: false,
        allowedrarity: ["common"]
      }
    },
    network
  });

  if (!unspentsResponse.success) {
    throw new Error(unspentsResponse.message);
  }

  if (!unspentsResponse.rdata.length) {
    throw new Error("No UTXOs found.");
  }

  const psbt = new bitcoin.Psbt({ network: networkObj });
  const utxos = unspentsResponse.rdata;
  let totalValue = 0;
  let paymentUtxoCount = 0;

  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i];

    if (utxo.inscriptions.length > 0) continue;

    const tx = await OrditApi.fetch<{
      success: boolean;
      rdata: any;
      message?: string;
    }>("utxo/transaction", {
      data: {
        txid: utxo.txid,
        options: {
          noord: false,
          nohex: false,
          nowitness: false
        }
      },
      network
    });

    if (!tx.success) {
      throw new Error("Failed to get raw transaction for id: " + utxo.txid);
    }

    const rawTx = bitcoin.Transaction.fromHex(tx.rdata?.hex);

    const input: any = {
      hash: utxo.txid,
      index: utxo.n,
      nonWitnessUtxo: rawTx.toBuffer()
    };

    psbt.addInput(input);
    totalValue += utxo.sats;
    paymentUtxoCount += 1;

    const fees = calculateTxFeeWithRate(
      paymentUtxoCount,
      2, // 2-dummy outputs
      feeRate
    );
    if (totalValue >= 600 * 2 + fees) {
      break;
    }
  }

  const finalFees = calculateTxFeeWithRate(
    paymentUtxoCount,
    2, // 2-dummy outputs
    feeRate
  );

  const changeValue = totalValue - 600 * 2 - finalFees;
  // We must have enough value to create a dummy utxo and pay for tx fees
  if (changeValue < 0) {
    throw new Error(`You might have pending transactions or not enough fund`);
  }

  psbt.addOutput({
    address: address.address!,
    value: 600
  });
  psbt.addOutput({
    address: address.address!,
    value: 600
  });

  if (changeValue > 580) {
    psbt.addOutput({
      address: address.address!,
      value: changeValue
    });
  }

  return psbt;
}

export function mergeSignedBuyerPSBTHex(signedSellerPsbtHex: string, signedBuyerPsbtHex: string): string {
  const sellerSignedPsbt = bitcoin.Psbt.fromHex(signedSellerPsbtHex);
  const buyerSignedPsbt = bitcoin.Psbt.fromHex(signedBuyerPsbtHex);

  (buyerSignedPsbt.data.globalMap.unsignedTx as any).tx.ins[2] = (
    sellerSignedPsbt.data.globalMap.unsignedTx as any
  ).tx.ins[0];
  buyerSignedPsbt.data.inputs[2] = sellerSignedPsbt.data.inputs[0];

  return buyerSignedPsbt.toHex();
}

export async function getSellerInputsOutputs({
  inscriptionId,
  price,
  receiveAddress,
  publicKey,
  pubKeyType = "taproot",
  network = "testnet",
  side = "seller"
}: GenerateSellerInstantBuyPsbtOptions) {
  const format = addressNameToType[pubKeyType];
  const address = getAddressesFromPublicKey(publicKey, network, format)[0];

  const inputs = [];
  const outputs = [];

  const unspentsResponse = await OrditApi.fetch<{
    success: boolean;
    rdata: Array<any>;
    message?: string;
  }>("utxo/unspents", {
    data: {
      address: address.address,
      options: {
        txhex: true,
        notsafetospend: false,
        allowedrarity: ["common"]
      }
    },
    network
  });

  if (!unspentsResponse.success) {
    throw new Error(unspentsResponse.message);
  }

  if (!unspentsResponse.rdata.length) {
    throw new Error("No UTXOs found.");
  }

  const utxos = unspentsResponse.rdata;
  const ordUtxos: any = [];
  const nonOrdUtxos: any = [];

  utxos.forEach((utxo) => {
    if (utxo.inscriptions.length > 0) {
      ordUtxos.push(utxo);
    } else {
      nonOrdUtxos.push(utxo);
    }
  });

  let found = false;

  for (let i = 0; i < ordUtxos.length; i++) {
    const ordUtxo: any = ordUtxos[i];
    if (ordUtxo.inscriptions.find((v: any) => v.id == inscriptionId)) {
      if (ordUtxo.inscriptions.length > 1) {
        throw new Error("Multiple inscriptions! Please split them first.");
      }
      const tx = await OrditApi.fetch<{
        success: boolean;
        rdata: any;
        message?: string;
      }>("utxo/transaction", {
        data: {
          txid: ordUtxo.txid,
          options: {
            noord: false,
            nohex: false,
            nowitness: false
          }
        },
        network
      });

      if (!tx.success) {
        throw new Error("Failed to get raw transaction for id: " + ordUtxo.txid);
      }

      const rawTx = bitcoin.Transaction.fromHex(tx.rdata?.hex);
      if (format !== "p2tr") {
        for (const output in rawTx.outs) {
          try {
            rawTx.setWitness(parseInt(output), []);
          } catch {}
        }
      }

      const options: any = {};

      const data = {
        hash: ordUtxo.txid,
        index: parseInt(ordUtxo.n),
        nonWitnessUtxo: rawTx.toBuffer(),
        witnessUtxo: rawTx.outs[0]
      };

      if (side === "seller") {
        options.sighashType = bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY;
      }

      if (format === "p2tr") {
        options.tapInternalKey = Buffer.from(address.xkey!, "hex");
      }

      inputs.push({
        ...data,
        ...options
      });
      outputs.push({ address: receiveAddress, value: price });

      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error("inscription not found.");
  }

  return { inputs, outputs };
}

export interface UnspentOutput {
  txId: string;
  outputIndex: number;
  satoshis: number;
  scriptPk: string;
  addressType: AddressTypes;
  address: string;
  ords: {
    id: string;
    offset: number;
  }[];
}

export interface GenerateSellerInstantBuyPsbtOptions {
  inscriptionId: string;
  price: number;
  receiveAddress: string;
  publicKey: string;
  pubKeyType?: AddressFormats;
  network?: Network;
  side?: "seller" | "buyer";
}

export interface GenerateBuyerInstantBuyPsbtOptions {
  publicKey: string;
  pubKeyType?: AddressFormats;
  network?: Network;
  feeRate?: number;
  sellerData: GenerateSellerInstantBuyPsbtOptions;
}

export interface GenerateDummyUtxos {
  publicKey: string;
  pubKeyType?: AddressFormats;
  network?: Network;
  feeRate?: number;
}
