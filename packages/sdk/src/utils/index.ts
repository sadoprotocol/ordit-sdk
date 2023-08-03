import * as ecc from "@bitcoinerlab/secp256k1"
import { BIP32Interface } from "bip32"
import * as bitcoin from "bitcoinjs-lib"
import ECPairFactory from "ecpair"

import { AddressFormats, AddressTypes } from "../addresses/formats"
import { Network } from "../config/types"
import { CalculateTxFeeOptions, CalculateTxWeightOptions } from "./types"

export function getNetwork(value: Network) {
  if (value === "mainnet") {
    return bitcoin.networks["bitcoin"]
  }

  return bitcoin.networks[value]
}

export function createTransaction(
  key: Buffer,
  type: AddressTypes,
  network: Network | bitcoin.Network,
  paymentOptions?: bitcoin.Payment
) {
  bitcoin.initEccLib(ecc)
  const networkObj = typeof network === "string" ? getNetwork(network) : network

  if (type === "p2tr") {
    return bitcoin.payments.p2tr({ internalPubkey: key, network: networkObj, ...paymentOptions })
  }

  if (type === "p2sh") {
    return bitcoin.payments.p2sh({
      redeem: bitcoin.payments.p2wpkh({ pubkey: key, network: networkObj }),
      network: networkObj
    })
  }

  return bitcoin.payments[type]({ pubkey: key, network: networkObj })
}

export function getDerivationPath(formatType: AddressFormats, account = 0, addressIndex = 0) {
  const pathFormat = {
    legacy: `m/44'/0'/${account}'/0/${addressIndex}`,
    "nested-segwit": `m/49'/0'/${account}'/0/${addressIndex}`,
    segwit: `m/84'/0'/${account}'/0/${addressIndex}`,
    taproot: `m/86'/0'/${account}'/0/${addressIndex}`
  }
  return pathFormat[formatType]
}

export function hdNodeToChild(
  node: BIP32Interface,
  formatType: AddressFormats = "legacy",
  addressIndex = 0,
  account = 0
) {
  const fullDerivationPath = getDerivationPath(formatType, account, addressIndex)

  return node.derivePath(fullDerivationPath)
}

export function calculateTxFeeWithRate(
  inputsLength: number,
  outputsLength: number,
  feeRate = 10,
  hasChangeOutput: 0 | 1 = 1
): number {
  const baseTxSize = 10
  const inSize = 180
  const outSize = 34

  const txSize = baseTxSize + inputsLength * inSize + outputsLength * outSize + hasChangeOutput * outSize
  const fee = txSize * feeRate
  return fee
}

export function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.subarray(1, 33)
}

export function tweakSigner(signer: bitcoin.Signer, opts: any = {}): bitcoin.Signer {
  const ECPair = ECPairFactory(ecc)

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey: Uint8Array | undefined = signer.privateKey!
  if (!privateKey) {
    throw new Error("Private key is required for tweaking signer!")
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey)
  }

  const tweakedPrivateKey = ecc.privateAdd(privateKey, tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash))
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!")
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network
  })
}

export function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoin.crypto.taggedHash("TapTweak", Buffer.concat(h ? [pubKey, h] : [pubKey]))
}

export function calculateTxFee({
  totalInputs,
  totalOutputs,
  satsPerByte,
  type,
  additional = {}
}: CalculateTxFeeOptions): number {
  const txWeight = calculateTxWeight({ totalInputs, totalOutputs, type, additional })
  return txWeight * satsPerByte
}

export function calculateTxWeight({ totalInputs, totalOutputs, type, additional }: CalculateTxWeightOptions) {
  const baseWeight = getInputOutputBaseWeightByType(type)

  const inputVBytes = baseWeight.input * totalInputs
  const outputVBytes = baseWeight.output * totalOutputs
  const baseVBytes = inputVBytes + outputVBytes + baseWeight.txHeader
  const additionalVBytes =
    additional && Buffer.isBuffer(additional?.witnessScript) ? additional.witnessScript.byteLength : 0
  const weight = 3 * baseVBytes + (baseVBytes + additionalVBytes)
  const vSize = Math.ceil(weight / 4)
  console.log("weight >>", inputVBytes, outputVBytes, baseVBytes, additionalVBytes, weight, vSize)

  return vSize
}

export function getInputOutputBaseWeightByType(type: AddressFormats) {
  switch (type) {
    case "taproot":
      return { input: 57.5, output: 43, txHeader: 10.5 }

    case "segwit":
      return { input: 68, output: 31, txHeader: 10.5 }

    case "nested-segwit":
      return { input: 68, output: 32, txHeader: 10.5 }

    case "legacy":
      return { input: 147.5, output: 34, txHeader: 10.5 }

    default:
      throw new Error("Invalid type")
  }
}
