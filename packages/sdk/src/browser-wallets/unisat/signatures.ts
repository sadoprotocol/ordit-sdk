import { Psbt } from "bitcoinjs-lib";

import { isUnisatInstalled } from "./utils";

export async function signPsbt(psbt: Psbt) {
  if (!isUnisatInstalled()) {
    throw new Error("Unisat not installed.");
  }

  const psbtHex = psbt.toHex();

  const signedPsbtHex = await window.unisat.signPsbt(psbtHex);

  if (!signedPsbtHex) {
    throw new Error("Failed to sign psbt hex using Unisat.");
  }

  if (psbtHex === signedPsbtHex) {
    throw new Error("Psbt has already been signed.");
  }

  const signedPsbt = Psbt.fromHex(signedPsbtHex);
  let rawTxHex = null;
  try {
    rawTxHex = signedPsbt.extractTransaction().toHex();
  } catch (error) {
    return {
      rawTxHex,
      psbt: {
        hex: signedPsbt.toHex(),
        base64: signedPsbt.toBase64()
      }
    };
  }

  return {
    rawTxHex,
    psbt: {
      hex: signedPsbt.toHex(),
      base64: signedPsbt.toBase64()
    }
  };
}

export async function signMessage(message: string) {
  if (!isUnisatInstalled()) {
    throw new Error("Unisat not installed.");
  }

  const signature = await window.unisat.signMessage(message);

  if (!signature) {
    throw new Error("Failed to sign message using Unisat.");
  }

  return {
    base64: signature,
    hex: Buffer.from(signature, "base64").toString("hex")
  };
}

export async function sendBitcoin(toAddress: string, satoshis: number, feeRate: number) {
  if (!isUnisatInstalled()) {
    throw new Error("Unisat not installed.");
  }

  try {
    const txId = await window.unisat.sendBitcoin(toAddress, satoshis, {
      feeRate
    });
    return txId;
  } catch (error: any) {
    throw new Error(error.message);
  }
}
