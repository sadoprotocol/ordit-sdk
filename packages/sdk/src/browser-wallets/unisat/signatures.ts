import { Psbt } from "bitcoinjs-lib";

import { UnisatSignPSBTOptions } from "./types"

export async function signPsbt(psbt: Psbt, { finalize = true }: UnisatSignPSBTOptions = {}) {
  if (!isUnisatInstalled()) {
    throw new Error("Unisat not installed.");
  }

  const psbtHex = psbt.toHex();

  const signedPsbtHex = await window.unisat.signPsbt(psbtHex, { autoFinalized: finalize })

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
