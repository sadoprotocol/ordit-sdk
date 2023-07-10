import * as bitcoin from "bitcoinjs-lib";

import {
  AddressFormats,
  addressNameToType,
  AddressTypes,
  calculateTxFeeWithRate,
  createTransaction,
  getAddressesFromPublicKey,
  getNetwork,
  OrditApi,
  toXOnly
} from "..";
import { Network } from "../config/types";

export async function generateSellerPsbt({
  inscriptionOutPoint,
  price,
  receiveAddress,
  publicKey,
  pubKeyType = "taproot",
  network = "testnet"
}: GenerateSellerInstantBuyPsbtOptions) {
  const { inputs, outputs } = await getSellerInputsOutputs({
    inscriptionOutPoint,
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

export async function generateBuyerPsbt({
  publicKey,
  pubKeyType = "legacy",
  feeRate = 10,
  network = "testnet",
  sellerPsbt,
  inscriptionOutPoint
}: GenerateBuyerInstantBuyPsbtOptions) {
  const networkObj = getNetwork(network);
  const format = addressNameToType[pubKeyType];
  const address = getAddressesFromPublicKey(publicKey, network, format)[0];
  let postage = 10000; // default postage
  let ordOutNumber = 0;
  // get postage from outpoint

  try {
    const [ordTxId, ordOut] = inscriptionOutPoint.split(":");
    if (!ordTxId || !ordOut) {
      throw new Error("Invalid outpoint.");
    }

    ordOutNumber = parseInt(ordOut);
    const tx = await OrditApi.fetch<{
      success: boolean;
      rdata: any;
      message?: string;
    }>("utxo/transaction", {
      data: {
        txid: ordTxId,
        options: {
          noord: false,
          nohex: false,
          nowitness: false
        }
      },
      network
    });

    if (!tx.success) {
      throw new Error("Failed to get raw transaction for id: " + ordTxId);
    }

    const output = tx.rdata && tx.rdata.vout[ordOutNumber];

    if (!output) {
      throw new Error("Outpoint not found.");
    }

    postage = output.value * 1e8;
  } catch (error) {
    throw new Error(error.message);
  }

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
      nonWitnessUtxo: rawTx.toBuffer()
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

    if (format === "p2tr") {
      const xKey = toXOnly(Buffer.from(publicKey, "hex"));
      const p2tr = createTransaction(xKey, "p2tr", network);

      input.tapInternalKey = toXOnly(Buffer.from(publicKey, "hex"));
      input.witnessUtxo = {
        script: p2tr.output!,
        value: dummyUtxo.sats
      };
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
    value: dummyUtxos[0].sats + dummyUtxos[1].sats + ordOutNumber
  });

  // Add ordinal output
  psbt.addOutput({
    address: address.address!,
    value: postage
  });

  // seller psbt merge

  const decodedSellerPsbt = bitcoin.Psbt.fromHex(sellerPsbt, { network: networkObj });
  // inputs
  (psbt.data.globalMap.unsignedTx as any).tx.ins[2] = (decodedSellerPsbt.data.globalMap.unsignedTx as any).tx.ins[0];
  psbt.data.inputs[2] = decodedSellerPsbt.data.inputs[0];
  // outputs
  (psbt.data.globalMap.unsignedTx as any).tx.outs[2] = (decodedSellerPsbt.data.globalMap.unsignedTx as any).tx.outs[0];
  psbt.data.outputs[2] = decodedSellerPsbt.data.outputs[0];

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
      nonWitnessUtxo: rawTx.toBuffer()
    };

    if (pubKeyType === "taproot") {
      const xKey = toXOnly(Buffer.from(publicKey, "hex"));
      const p2tr = createTransaction(xKey, "p2tr", network);

      input.tapInternalKey = toXOnly(Buffer.from(publicKey, "hex"));
      input.witnessUtxo = {
        script: p2tr.output!,
        value: utxo.sats
      };
    }

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
  value = 600,
  count = 2,
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

    if (pubKeyType === "taproot") {
      const xKey = toXOnly(Buffer.from(publicKey, "hex"));
      const p2tr = createTransaction(xKey, "p2tr", network);

      input.tapInternalKey = toXOnly(Buffer.from(publicKey, "hex"));
      input.witnessUtxo = {
        script: p2tr.output!,
        value: utxo.sats
      };
    }

    psbt.addInput(input);

    totalValue += utxo.sats;
    paymentUtxoCount += 1;

    const fees = calculateTxFeeWithRate(
      paymentUtxoCount,
      count, // 2-dummy outputs
      feeRate
    );
    if (totalValue >= value * count + fees) {
      break;
    }
  }

  const finalFees = calculateTxFeeWithRate(
    paymentUtxoCount,
    count, // 2-dummy outputs
    feeRate
  );

  const changeValue = totalValue - value * count - finalFees;
  // We must have enough value to create a dummy utxo and pay for tx fees
  if (changeValue < 0) {
    throw new Error(`You might have pending transactions or not enough fund`);
  }

  Array(count)
    .fill(value)
    .forEach((val) => {
      psbt.addOutput({
        address: address.address!,
        value: val
      });
    });

  if (changeValue > 580) {
    psbt.addOutput({
      address: address.address!,
      value: changeValue
    });
  }

  return psbt;
}

export async function getSellerInputsOutputs({
  inscriptionOutPoint,
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
    if (ordUtxo.inscriptions.find((v: any) => v.outpoint == inscriptionOutPoint)) {
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

      const data: any = {
        hash: ordUtxo.txid,
        index: parseInt(ordUtxo.n),
        nonWitnessUtxo: rawTx.toBuffer()
      };
      const postage = ordUtxo.sats;

      if (side === "seller") {
        options.sighashType = bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY;
      }

      if (format === "p2tr") {
        const xKey = toXOnly(Buffer.from(publicKey, "hex"));
        const p2tr = createTransaction(xKey, "p2tr", network);

        data.tapInternalKey = toXOnly(Buffer.from(publicKey, "hex"));
        data.witnessUtxo = {
          script: p2tr.output!,
          value: postage
        };
      }

      inputs.push({
        ...data,
        ...options
      });
      outputs.push({ address: receiveAddress, value: price + postage });

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
  inscriptionOutPoint: string;
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
  inscriptionOutPoint: string;
  sellerPsbt: string;
}

export interface GenerateDummyUtxos {
  value: number;
  count: number;
  publicKey: string;
  pubKeyType?: AddressFormats;
  network?: Network;
  feeRate?: number;
}
