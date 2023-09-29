import { Psbt } from "bitcoinjs-lib"

import { BrowserWalletSignPSBTResponse } from "../types"
import { UnisatSignPSBTOptions } from "../unisat/types"
import { isCoin98Installed } from "./utils"

export async function signPsbt(
  psbt: Psbt,
  { finalize = true, extractTx = true }: UnisatSignPSBTOptions = {}
): Promise<BrowserWalletSignPSBTResponse> {
  if (!isCoin98Installed()) {
    throw new Error("Coin98 not installed")
  }

  const psbtHex = psbt.toHex()
  const signedPsbtHex = await window.coin98.signPsbt(psbtHex, { autoFinalized: finalize })
  if (!signedPsbtHex) {
    throw new Error("Failed to sign psbt hex using Coin98")
  }

  if (psbtHex === signedPsbtHex) {
    throw new Error("Psbt has already been signed.")
  }

  const signedPsbt = Psbt.fromHex(signedPsbtHex)

  return {
    hex: extractTx ? signedPsbt.extractTransaction().toHex() : signedPsbt.toHex(),
    base64: !extractTx ? signedPsbt.toBase64() : null
  }
}

export async function signMessage(message: string) {
  if (!isCoin98Installed()) {
    throw new Error("Coin98 not installed.")
  }

  const signature = await window.coin98.signMessage(message)

  if (!signature) {
    throw new Error("Failed to sign message using Coin98")
  }

  return {
    base64: signature,
    hex: Buffer.from(signature, "base64").toString("hex")
  }
}
