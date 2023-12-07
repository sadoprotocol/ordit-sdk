import { Address, Signer, Verifier } from "bip322-js"
import { sign, verify } from "bitcoinjs-message"

import { Network } from "../config/types"
import { getDerivedNode } from "../keys"
import { createTransaction, getNetwork } from "../utils"
import { OrditSDKError } from "../utils/errors"

export async function signMessage(options: SignMessageOptions) {
  const network = getNetwork(options.network)
  options.format = "core"

  if (!options.message || !(options.bip39 || options.seed)) {
    throw new OrditSDKError("Invalid options provided.")
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
    throw new OrditSDKError("Unable to sign message.")
  }
}

export function verifyMessage(options: VerifyMessageOptions) {
  try {
    if (Address.isP2PKH(options.address)) {
      return !verify(options.message, options.address, options.signature) ? fallbackVerification(options) : true
    }

    return Verifier.verifySignature(options.address, options.message, options.signature)
  } catch (_) {
    return false
  }
}

function fallbackVerification({ message, address, signature }: VerifyMessageOptions) {
  let isValid = false
  const flags = [...Array(12).keys()].map((i) => i + 31)
  for (const flag of flags) {
    const flagByte = Buffer.alloc(1)
    flagByte.writeInt8(flag)
    let sigBuffer = Buffer.from(signature, "base64").slice(1)
    sigBuffer = Buffer.concat([flagByte, sigBuffer])
    const candidateSig = sigBuffer.toString("base64")
    try {
      isValid = verify(message, address, candidateSig)
      if (isValid) break
    } catch (e) {}
  }
  return isValid
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
