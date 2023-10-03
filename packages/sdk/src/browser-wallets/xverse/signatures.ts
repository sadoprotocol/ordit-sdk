import { Psbt } from "bitcoinjs-lib"
import { signMessage as _signMessage, signTransaction } from "sats-connect"

import { Network } from "~/config/types"
import { InputsToSign } from "~/inscription/types"

import { BrowserWalletSignPSBTResponse } from "../types"
import { isXverseInstalled, XverseNetwork } from "./utils"

export async function signPsbt({
  psbt,
  network,
  inputs,
  finalize = true,
  extractTx = true,
  message = "Sign Transaction"
}: XverseSignPsbtOptions): Promise<BrowserWalletSignPSBTResponse> {
  if (!psbt || !network || !inputs.length) {
    throw new Error("Invalid options provided.")
  }

  if (!isXverseInstalled()) {
    throw new Error("xverse not installed.")
  }

  let hex: string
  let base64: string | null = null
  const handleFinish = (response: XverseSignPsbtResponse) => {
    const { psbtBase64 } = response
    if (!psbtBase64) {
      throw new Error("Failed to sign transaction using xVerse")
    }

    const signedPsbt = Psbt.fromBase64(psbtBase64)

    if (finalize) {
      if (!inputs.length) {
        signedPsbt.finalizeAllInputs()
      } else {
        inputs.forEach((input) => {
          input.signingIndexes.forEach((index) => {
            signedPsbt.finalizeInput(index)
          })
        })
      }
    }

    hex = extractTx ? signedPsbt.extractTransaction().toHex() : signedPsbt.toHex()
    base64 = !extractTx ? signedPsbt.toBase64() : null
  }

  const xverseOptions = {
    payload: {
      network: {
        type: (network.charAt(0).toUpperCase() + network.slice(1)) as XverseNetwork
      },
      message,
      psbtBase64: psbt.toBase64(),
      broadcast: false,
      inputsToSign: inputs
    },
    onFinish: handleFinish,
    onCancel: () => handleOnSignCancel("transaction")
  }

  await signTransaction(xverseOptions)

  return { hex: hex!, base64 }
}

export async function signMessage(options: XverseSignMessageOptions) {
  let result = null
  if (!options.message || !options.network || !options.address) {
    throw new Error("Invalid options provided.")
  }

  if (!isXverseInstalled()) {
    throw new Error("xverse not installed.")
  }

  const handleFinish = (response: string) => {
    result = {
      signature: response
    }
  }

  const xverseOptions = {
    payload: {
      network: {
        type: (options.network.charAt(0).toUpperCase() + options.network.slice(1)) as XverseNetwork
      },
      message: options.message,
      broadcast: false,
      address: options.address
    },
    onFinish: handleFinish,
    onCancel: () => handleOnSignCancel("message")
  }

  await _signMessage(xverseOptions)

  return result
}

function handleOnSignCancel(type: "transaction" | "message") {
  throw new Error(`Failed to sign ${type} using xVerse`)
}

export type XverseSignPsbtOptions = {
  psbt: Psbt
  network: Network
  inputs: InputsToSign[]
  finalize?: boolean
  extractTx?: boolean
  message?: string
}

export type XverseSignPsbtResponse = {
  psbtBase64: string
}

export type XverseSignMessageOptions = {
  address: string
  message: string
  network: Network
}
