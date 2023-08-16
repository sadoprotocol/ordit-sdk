import { Psbt } from "bitcoinjs-lib"
import { InputToSign, signMessage as _signMessage, signTransaction } from "sats-connect"

import { Network } from "../../config/types"
import { isXverseInstalled, XverseNetwork } from "./utils"

interface XverseSignedPsbt {
  rawTxHex: string | null
  psbt: {
    hex: string
    base64: string
  }
}

export async function signPsbt({ psbt, network, inputs, finalize = true, extractTx = true }: XverseSignPsbtOptions) {
  const result: XverseSignedPsbt = {
    rawTxHex: null,
    psbt: {
      hex: "",
      base64: ""
    }
  }

  if (!psbt || !network || !inputs) {
    throw new Error("Invalid options provided.")
  }

  if (!isXverseInstalled()) {
    throw new Error("xverse not installed.")
  }

  const handleFinish = (response: XverseSignPsbtResponse) => {
    const { psbtBase64 } = response

    if (!psbtBase64) {
      throw new Error("Failed to sign transaction using xVerse")
    }

    const signedPsbt = Psbt.fromBase64(psbtBase64)

    try {
      finalize && signedPsbt.finalizeAllInputs()
      result.rawTxHex = extractTx ? signedPsbt.extractTransaction().toHex() : null
    } catch (error) {
      // Do nothing, leave the rawTxHex as null
    }

    result.psbt = {
      hex: signedPsbt.toHex(),
      base64: signedPsbt.toBase64()
    }
  }

  const xverseOptions = {
    payload: {
      network: {
        type: (network.charAt(0).toUpperCase() + network.slice(1)) as XverseNetwork
      },
      message: "Sign Ordit SDK Transaction",
      psbtBase64: psbt.toBase64(),
      broadcast: false,
      inputsToSign: inputs
    },
    onFinish: handleFinish,
    onCancel: () => handleOnSignCancel("Psbt")
  }

  await signTransaction(xverseOptions)

  return result
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
    onCancel: () => handleOnSignCancel("Message")
  }

  await _signMessage(xverseOptions)

  return result
}

function handleOnSignCancel(value = "") {
  throw new Error(`Failed to sign ${value} using xVerse`)
}

export type XverseSignPsbtOptions = {
  psbt: Psbt
  network: Network
  inputs: InputToSign[]
  finalize?: boolean
  extractTx?: boolean
}

export type XverseSignPsbtResponse = {
  psbtBase64: string
}

export type XverseSignMessageOptions = {
  address: string
  message: string
  network: Network
}
