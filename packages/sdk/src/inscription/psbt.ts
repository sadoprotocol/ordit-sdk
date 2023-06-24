import { Psbt } from "bitcoinjs-lib";

import { getAddresses } from "../addresses";
import { OrditApi } from "../api";
import { createTransaction, getNetwork } from "../utils";
import { GetWalletOptions } from "../wallet";
import { buildWitnessScript } from "./witness";

export async function createRevealPsbt(options: CreateRevealPsbtOptions) {
  const networkObj = getNetwork(options.network);
  const key = (await getAddresses({ ...options, format: "p2tr" }))[0];
  const xkey = key.xkey;

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

  const unspentsResponse = await OrditApi.fetch<{
    success: boolean;
    rdata: Array<any>;
    message?: string;
  }>("utxo/unspents", {
    data: {
      address: inscribePayTx.address!,
      options: {
        txhex: true,
        notsafetospend: false,
        allowedrarity: ["common"]
      }
    },
    network: options.network
  });

  if (unspentsResponse.success) {
    const unspents = unspentsResponse.rdata;

    const feesForWitnessData = options.fees;
    let sutableUnspent: any = null;

    unspents.forEach((unspent) => {
      if (unspent.sats >= options.postage + feesForWitnessData && unspent.safeToSpend === true) {
        sutableUnspent = unspent;
      }
    });

    if (sutableUnspent) {
      const fees = options.postage + feesForWitnessData;
      const change = sutableUnspent.sats - fees;

      const psbt = new Psbt({ network: networkObj });
      try {
        psbt.addInput({
          hash: sutableUnspent.txid,
          index: parseInt(sutableUnspent.n),
          tapInternalKey: Buffer.from(xkey, "hex"),
          witnessUtxo: {
            script: inscribePayTx.output!,
            value: parseInt(sutableUnspent.sats)
          },
          tapLeafScript: [
            {
              leafVersion: redeemScript.redeemVersion,
              script: redeemScript.output,
              controlBlock: inscribePayTx.witness![inscribePayTx.witness!.length - 1]
            }
          ]
        });

        psbt.addOutput({
          address: options.destination,
          value: options.postage
        });

        if (change) {
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
      } catch (error) {
        throw new Error(error.message);
      }
    } else {
      throw new Error("No suitable unspent found for reveal");
    }
  } else {
    throw new Error(unspentsResponse.message);
  }
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
