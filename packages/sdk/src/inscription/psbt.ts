import { Psbt } from "bitcoinjs-lib"

import { getAddresses } from "../addresses"
import { OrditApi } from "../api"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { createTransaction, getNetwork } from "../utils"
import { GetWalletOptions } from "../wallet"
import { buildWitnessScript } from "./witness"

export async function createRevealPsbt(options: CreateRevealPsbtOptions) {
  const networkObj = getNetwork(options.network);
  const key = (await getAddresses({ ...options, format: "p2tr" }))[0];
  const xkey = key.xkey;
  
  options.safeMode = !options.safeMode ? "on": options.safeMode

  if (!xkey) {
    throw new Error("Failed to build createRevealPsbt");
  }

  const witnessScript = buildWitnessScript({ ...options, xkey });

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

  const inscribePayTx = createTransaction(Buffer.from(xkey, "hex"), "p2tr", options.network, {
    scriptTree: scriptTree,
    redeem: redeemScript
  });

  const { spendableUTXOs } = await OrditApi.fetchUnspentUTXOs({ 
    address: inscribePayTx.address!, network: options.network,
  });

  const feesForWitnessData = options.fees;
  const suitableUTXO = spendableUTXOs.find((utxo) => {
    return utxo.sats >= options.postage + feesForWitnessData 
    && (options.safeMode === "off" || (options.safeMode === "on" && utxo.safeToSpend === true))
  });

  if(!suitableUTXO) {
    throw new Error('No suitable unspent found for reveal')
  }

  const fees = options.postage + feesForWitnessData;
  const change = suitableUTXO.sats - fees;

  const psbt = new Psbt({ network: networkObj });
  psbt.addInput({
    hash: suitableUTXO.txid,
    index: suitableUTXO.n,
    tapInternalKey: Buffer.from(xkey, "hex"),
    witnessUtxo: {
      script: inscribePayTx.output!,
      value: suitableUTXO.sats
    },
    tapLeafScript: [{
      leafVersion: redeemScript.redeemVersion,
      script: redeemScript.output,
      controlBlock: inscribePayTx.witness![inscribePayTx.witness!.length - 1]
    }]
  });

  psbt.addOutput({
    address: options.destination,
    value: options.postage
  });

  if (change > MINIMUM_AMOUNT_IN_SATS) {
    let changeAddress = inscribePayTx.address;
    if (options.changeAddress) {
      changeAddress = options.changeAddress;
    }

    psbt.addOutput({
      address: changeAddress!,
      value: change
    });
  }

  return {
    hex: psbt.toHex(),
    base64: psbt.toBase64()
  };
}

export type CreateRevealPsbtOptions = Omit<GetWalletOptions, "format"> & {
  fees: number;
  postage: number;
  mediaType: string;
  mediaContent: string;
  destination: string;
  changeAddress: string;
  meta: any;
};
