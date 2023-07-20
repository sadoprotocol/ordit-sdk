import * as ecc from "@bitcoinerlab/secp256k1";
import BIP32Factory, { BIP32API } from "bip32";
import { Network, Psbt } from "bitcoinjs-lib";

import { createTransaction, getNetwork } from "../utils";
import { GetWalletOptions, getWalletWithBalances } from "../wallet";

export async function createPsbt({ network, format, pubKey, ins, outs }: CreatePsbtOptions) {
  const netWorkObj = getNetwork(network);
  const bip32 = BIP32Factory(ecc);

  const walletWithBalances = await getWalletWithBalances({
    pubKey,
    format,
    network
  });

  let fees = 0;
  let change = 0;
  const dust = 600;
  let inputs_used = 0;
  const sats_per_byte = 10;
  let total_cardinals_to_send = 0;
  let total_cardinals_available = 0;
  const unsupported_inputs = [];
  const unspents_to_use = [];
  const xverse_inputs = [];

  const psbt = new Psbt({ network: netWorkObj });

  outs.forEach((output) => {
    try {
      if (!output.cardinals) throw new Error("No cardinals in output.");

      total_cardinals_to_send = +parseInt(output.cardinals);
      psbt.addOutput({
        address: output.address,
        value: parseInt(output.cardinals)
      });
    } catch (error) {
      //handle error
    }
  });

  ins.forEach((input, idx) => {
    if (walletWithBalances?.spendables === undefined) {
      throw new Error("No spendables available.");
    }

    if (input.address) {
      walletWithBalances.spendables.forEach((spendable: any) => {
        const sats = spendable.sats;
        const scriptPubKeyAddress = spendable.scriptPubKey.address;
        const scriptPubKeyType = spendable.scriptPubKey.type as string;
        let addedInputSuccessfully = false;

        fees = JSON.parse(JSON.stringify((80 + (inputs_used + 1) * 180) * sats_per_byte));

        if (input.address === "any") {
          ins[idx].address = scriptPubKeyAddress;
        }

        if (input.address === scriptPubKeyAddress) {
          addedInputSuccessfully = addInputToPsbtByType(spendable, scriptPubKeyType, psbt, bip32, netWorkObj);

          if (addedInputSuccessfully) {
            unspents_to_use.push(spendable);
            total_cardinals_available += sats;
            xverse_inputs.push({
              address: scriptPubKeyAddress,
              signingIndexes: [inputs_used]
            });
            inputs_used++;
          } else {
            unsupported_inputs.push(spendable);
          }
        }
      });
    }
  });

  if (!unspents_to_use.length) {
    throw new Error(
      `Not enough input value to cover outputs and fees. Total cardinals available: '${total_cardinals_available}'. Cardinals to send: '${total_cardinals_to_send}'. Estimated fees: '${fees}'.`
    );
  }

  change = total_cardinals_available - (total_cardinals_to_send + fees);

  if (change < 0) {
    throw new Error(`Insufficient balance for tx. Deposit ${change * -1} sats or adjust transfer amount to proceed`);
  }

  if (change >= dust) {
    psbt.addOutput({
      address: ins[0].address,
      value: change
    });
  }

  const psbtHex = psbt.toHex();
  const psbtBase64 = psbt.toBase64();

  return {
    hex: psbtHex,
    base64: psbtBase64
  };
}

function addInputToPsbtByType(spendable: any, type: string, psbt: Psbt, bip32: BIP32API, network: Network) {
  if (type === "witness_v1_taproot") {
    const chainCode = Buffer.alloc(32);
    chainCode.fill(1);

    let childNodeXOnlyPubkey = Buffer.from(spendable.pub, "hex");
    try {
      const key = bip32.fromPublicKey(Buffer.from(spendable.pub, "hex"), chainCode, network);
      childNodeXOnlyPubkey = key.publicKey.subarray(1, 33);
    } catch (error) {
      // fail silently
    }

    const p2tr = createTransaction(childNodeXOnlyPubkey, "p2tr", network);

    if (p2tr && p2tr.output) {
      psbt.addInput({
        hash: spendable.txid,
        index: parseInt(spendable.n),
        tapInternalKey: childNodeXOnlyPubkey,
        witnessUtxo: {
          script: p2tr.output,
          value: parseInt(spendable.sats)
        }
      });

      return true;
    }
  } else if (type === "witness_v0_keyhash") {
    try {
      const p2wpkh = createTransaction(Buffer.from(spendable.pub, "hex"), "p2wpkh", network);

      if (p2wpkh && p2wpkh.output) {
        psbt.addInput({
          hash: spendable.txid,
          index: parseInt(spendable.n),
          witnessUtxo: {
            script: p2wpkh.output,
            value: parseInt(spendable.sats)
          }
        });
      }

      return true;
    } catch (e) {
      //fail silently
    }
  } else if (type === "scripthash") {
    try {
      const p2sh = createTransaction(Buffer.from(spendable.pub, "hex"), "p2sh", network);

      if (p2sh && p2sh.output && p2sh.redeem) {
        psbt.addInput({
          hash: spendable.txid,
          index: parseInt(spendable.n),
          redeemScript: p2sh.redeem.output,
          witnessUtxo: {
            script: p2sh.output,
            value: parseInt(spendable.sats)
          }
        });

        return true;
      }
    } catch (error) {
      //fail silently
    }
  } else if (type === "pubkeyhash") {
    try {
      psbt.addInput({
        hash: spendable.txid,
        index: parseInt(spendable.n),
        nonWitnessUtxo: Buffer.from(spendable.txhex, "hex")
      });

      return true;
    } catch (e) {
      //fail silently
    }
  }

  return false;
}

export type CreatePsbtOptions = GetWalletOptions & {
  ins: any[];
  outs: any[];
};
