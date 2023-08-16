import * as ecc from "@bitcoinerlab/secp256k1"
import { BIP32Interface } from "bip32"
import * as bitcoin from "bitcoinjs-lib"
import ECPairFactory from "ecpair"

import { AddressFormats, AddressTypes } from "../addresses/formats"
import { Network } from "../config/types"
import {
  BufferOrHex,
  CalculateTxFeeOptions,
  CalculateTxVirtualSizeOptions,
  EncodeDecodeObjectOptions,
  NestedObject,
  OneOfAllDataFormats
} from "./types"

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
  additional: { witnessScripts = [] } = {}
}: CalculateTxFeeOptions): number {
  const txWeight = calculateTxVirtualSize({ totalInputs, totalOutputs, type, additional: { witnessScripts } })
  return txWeight * satsPerByte
}

export function calculateTxVirtualSize({
  totalInputs,
  totalOutputs,
  type,
  additional: { witnessScripts = [] } = {}
}: CalculateTxVirtualSizeOptions) {
  const baseWeight = getInputOutputBaseSizeByType(type)

  const inputVBytes = baseWeight.input * totalInputs
  const outputVBytes = baseWeight.output * totalOutputs
  const baseVBytes = inputVBytes + outputVBytes + baseWeight.txHeader
  const additionalVBytes = witnessScripts.reduce((acc, script) => (acc += script.byteLength), 0) || 0

  const weight = 3 * baseVBytes + (baseVBytes + additionalVBytes)
  const vSize = Math.ceil(weight / 4)

  return vSize
}

export function getInputOutputBaseSizeByType(type: AddressFormats) {
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

export const isObject = (o: any) => o?.constructor === Object
export const isString = (s: any) => s instanceof String || typeof s === "string"

function encodeDecodeObject(obj: NestedObject, { encode, depth = 0 }: EncodeDecodeObjectOptions) {
  const maxDepth = 5

  if (depth > maxDepth) {
    throw new Error("Object too deep")
  }

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue

    const value = obj[key]
    if (isObject(value)) {
      obj[key] = encodeDecodeObject(value as NestedObject, { encode, depth: depth++ })
    } else if (isString(value)) {
      obj[key] = encode ? encodeURIComponent(value as string) : decodeURIComponent(value as string)
    }
  }

  return obj
}

export function encodeObject(obj: NestedObject) {
  return encodeDecodeObject(obj, { encode: true })
}

export function decodeObject(obj: NestedObject) {
  return encodeDecodeObject(obj, { encode: false })
}

// Temporary convertors until bignumber.js is integrated
export function convertSatoshisToBTC(satoshis: number) {
  return satoshis / 10 ** 8
}

export function convertBTCToSatoshis(btc: number) {
  return parseInt((btc * 10 ** 8).toString()) // remove floating point overflow by parseInt
}

export function generateTxUniqueIdentifier(txId: string, index: number) {
  return `${txId}:${index}`
}

export function decodePSBT({ hex, base64, buffer }: OneOfAllDataFormats): bitcoin.Psbt {
  if (hex) return bitcoin.Psbt.fromHex(hex)
  if (base64) return bitcoin.Psbt.fromBase64(base64)
  if (buffer) return bitcoin.Psbt.fromBuffer(buffer)

  throw new Error("Invalid options")
}

export function decodeTx({ hex, buffer }: BufferOrHex): bitcoin.Transaction {
  if (hex) return bitcoin.Transaction.fromHex(hex)
  if (buffer) return bitcoin.Transaction.fromBuffer(buffer)

  throw new Error("Invalid options")
}
