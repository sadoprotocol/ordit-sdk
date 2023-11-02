import { Address, Signer, Verifier } from "bip322-js"
import { sign, verify } from "bitcoinjs-message"

import { Network } from "../config/types"
import { getDerivedNode } from "../keys"
import { createTransaction, getNetwork } from "../utils"

export async function signMessage(options: SignMessageOptions) {
  const network = getNetwork(options.network)
  options.format = "core"

  if (!options.message || !(options.bip39 || options.seed)) {
    throw new Error("Invalid options provided.")
  }

  const seedValue = options.bip39 || options.seed

  try {
    const { parent } = await getDerivedNode(seedValue!, options.network, options.path)
    //   const wif = parent.toWIF();
    //   const keyPair = EcPair.fromWIF(wif);
    const { address } = createTransaction(parent.publicKey, "p2pkh", network)

    const signature = Address.isP2PKH(address!)
      ? sign(options.message, parent.privateKey!)
      : Signer.sign(parent.privateKey!.toString(), address!, options.message)

    return {
      hex: signature.toString("hex"),
      base64: signature.toString("base64"),
      address
    }
  } catch (error) {
    throw new Error("Unable to sign message.")
  }
}

export function verifyMessage(options: VerifyMessageOptions) {
  return Address.isP2PKH(options.address)
    ? verify(options.message, options.address, options.signature)
    : Verifier.verifySignature(options.address, options.message, options.signature)
}

export type SignMessageOptions = {
  seed?: string
  bip39?: string
  network: Network
  path: string
  message: string
  format: "core"
}

export type VerifyMessageOptions = {
  address: string
  message: string
  signature: string
}
