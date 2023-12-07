import * as ecc from "@bitcoinerlab/secp256k1"
import * as bitcoin from "bitcoinjs-lib"

import { Network } from "../config/types"
import { getDerivedNode } from "../keys"
import { OrditSDKError } from "../utils/errors"

export async function signPsbt(options: SignPsbtOptions) {
  bitcoin.initEccLib(ecc)

  if (!(options.hex || options.base64) || !(options.seed || options.bip39)) {
    throw new Error("Invalid options provided.")
  }

  const seedValue = options.bip39 || options.seed
  let psbt = null

  //reconstruct psbt
  if (options.hex) {
    psbt = bitcoin.Psbt.fromHex(options.hex)
  }

  if (options.base64) {
    psbt = bitcoin.Psbt.fromBase64(options.base64)
  }

  if (psbt && psbt.inputCount > 0) {
    const { parent } = await getDerivedNode(seedValue!, options.network, options.path)
    let error = null

    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        psbt.signInput(i, parent)
      } catch (e) {
        error = e
      }
    }

    if (error) {
      throw new OrditSDKError(error.message)
    }

    const psbtHex = psbt.toHex()
    const psbtBase64 = psbt.toBase64()

    const psbtHasBeenSigned =
      (options.hex && psbtHex !== options.hex) || (options.base64 && psbtBase64 !== options.base64)

    if (psbtHasBeenSigned) {
      try {
        psbt.finalizeAllInputs()

        const signedHex = psbt.extractTransaction().toHex()

        return {
          hex: signedHex
        }
      } catch (error) {
        return {
          hex: psbtHex,
          base64: psbtBase64
        }
      }
    } else {
      throw new OrditSDKError("Signed PSBT is same as input PSBT.")
    }
  }
}

export type SignPsbtOptions = {
  seed?: string
  bip39?: string
  network: Network
  path: string
  hex?: string
  base64?: string
}
