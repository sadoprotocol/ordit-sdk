import { Psbt } from "bitcoinjs-lib"
import { sign } from "bitcoinjs-message"
import { ethers } from "ethers"

import { createTransaction } from "../.."
import { Network } from "../../config/types"
import { getDerivedNodeFromMetaMaskSignature } from "./addresses"
import { isMetaMaskInstalled } from "./utils"

export async function signPsbtWithAddress(options: SignMetaMaskPsbtOptions) {
  if (!isMetaMaskInstalled()) {
    throw new Error("Metamask not installed.")
  }

  if (!options.address || !options.psbt) {
    throw new Error("Invalid options provided.")
  }

  const provider = new ethers.BrowserProvider(window.ethereum)

  const msgToSign = `Generate Bitcoin addresses from ${options.address}?`

  const signature = await provider.send("personal_sign", [msgToSign, options.address])

  const node = await getDerivedNodeFromMetaMaskSignature(signature, "", options.network)

  if (!options.psbt.inputCount) {
    throw new Error("Unable to count inputs.")
  }

  for (let i = 0; i < options.psbt.inputCount; i++) {
    try {
      options.psbt.signInput(i, node.parent)
    } catch (error) {
      throw new Error(error)
    }
  }

  let rawTxHex = null

  try {
    options.psbt.finalizeAllInputs()
    rawTxHex = options.psbt.extractTransaction().toHex()
  } catch (error) {
    return {
      rawTxHex,
      psbt: {
        hex: options.psbt.toHex(),
        base64: options.psbt.toBase64()
      }
    }
  }

  return {
    rawTxHex,
    psbt: {
      hex: options.psbt.toHex(),
      base64: options.psbt.toBase64()
    }
  }
}

export async function signMessage(options: SignMetaMaskMessageOptions) {
  if (!isMetaMaskInstalled()) {
    throw new Error("Metamask not installed.")
  }

  if (!options.message) {
    throw new Error("Invalid options provided.")
  }

  const provider = new ethers.BrowserProvider(window.ethereum)

  const accounts = await provider.send("eth_requestAccounts", [])

  if (!accounts || !accounts.length) {
    throw new Error("Request to get addresses was rejected by user")
  }

  const address = accounts[0]

  const msgToSign = `Generate Bitcoin addresses from ${address}?`

  const signature = await provider.send("personal_sign", [msgToSign, address])

  const node = await getDerivedNodeFromMetaMaskSignature(signature, "", options.network)
  const { address: addressBtc } = createTransaction(node.parent.publicKey, "p2pkh", options.network)

  const signedMessage = sign(options.message, node.parent.privateKey!)

  return {
    hex: signedMessage.toString("hex"),
    base64: signedMessage.toString("base64"),
    address: addressBtc
  }
}

export type SignMetaMaskPsbtOptions = {
  address: string
  psbt: Psbt
  network: Network
}

export type SignMetaMaskMessageOptions = {
  message: string
  network: Network
}
