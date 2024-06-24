import * as ecc from "@bitcoinerlab/secp256k1"
import { BIP32Interface } from "bip32"
import * as bitcoin from "bitcoinjs-lib"
import ECPairFactory from "ecpair"

import { AddressFormats, AddressTypes, addressTypeToName } from "../addresses/formats"
import { Network } from "../config/types"
import { UTXO } from "../transactions/types"
import { OrditSDKError } from "./errors"
import {
  BufferOrHex,
  EncodeDecodeObjectOptions,
  GetScriptTypeResponse,
  IsBitcoinPaymentResponse,
  NestedObject,
  OneOfAllDataFormats
} from "./types"

export function getNetwork(value: Network) {
  if (value === "mainnet") {
    return bitcoin.networks.bitcoin
  }
  if (value === "signet") {
    return bitcoin.networks.testnet
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
    throw new OrditSDKError("Private key is required for tweaking signer!")
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey)
  }

  const tweakedPrivateKey = ecc.privateAdd(privateKey, tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash))
  if (!tweakedPrivateKey) {
    throw new OrditSDKError("Invalid tweaked private key!")
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network
  })
}

export function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoin.crypto.taggedHash("TapTweak", Buffer.concat(h ? [pubKey, h] : [pubKey]))
}

export const isObject = (o: any) => o?.constructor === Object
export const isString = (s: any) => s instanceof String || typeof s === "string"

function encodeDecodeObject(obj: NestedObject, { encode, depth = 0 }: EncodeDecodeObjectOptions) {
  const maxDepth = 5

  if (depth > maxDepth) {
    throw new OrditSDKError("Object too deep")
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

  throw new OrditSDKError("Invalid options")
}

export function decodeTx({ hex, buffer }: BufferOrHex): bitcoin.Transaction {
  if (hex) return bitcoin.Transaction.fromHex(hex)
  if (buffer) return bitcoin.Transaction.fromBuffer(buffer)

  throw new OrditSDKError("Invalid options")
}

function isPaymentFactory(payment: bitcoin.PaymentCreator, network: Network) {
  return (script: Buffer) => {
    try {
      return payment({ output: script, network: getNetwork(network) })
    } catch (error) {
      return false
    }
  }
}

export const isP2PKH = (script: Buffer, network: Network): IsBitcoinPaymentResponse => {
  const p2pkh = isPaymentFactory(bitcoin.payments.p2pkh, network)(script)
  return {
    type: "p2pkh",
    payload: p2pkh
  }
}
export const isP2WPKH = (script: Buffer, network: Network): IsBitcoinPaymentResponse => {
  const p2wpkh = isPaymentFactory(bitcoin.payments.p2wpkh, network)(script)
  return {
    type: "p2wpkh",
    payload: p2wpkh
  }
}
export const isP2WSHScript = (script: Buffer, network: Network): IsBitcoinPaymentResponse => {
  const p2wsh = isPaymentFactory(bitcoin.payments.p2wsh, network)(script)
  return {
    type: "p2sh",
    payload: p2wsh
  }
}
export const isP2SHScript = (script: Buffer, network: Network): IsBitcoinPaymentResponse => {
  const p2sh = isPaymentFactory(bitcoin.payments.p2sh, network)(script)
  return {
    type: "p2sh",
    payload: p2sh
  }
}
export const isP2TR = (script: Buffer, network: Network): IsBitcoinPaymentResponse => {
  const p2tr = isPaymentFactory(bitcoin.payments.p2tr, network)(script)
  return {
    type: "p2tr",
    payload: p2tr
  }
}
export function getScriptType(script: Buffer, network: Network): GetScriptTypeResponse {
  const p2pkh = isP2PKH(script, network)
  if (p2pkh.payload) {
    return {
      format: addressTypeToName["p2pkh"],
      ...p2pkh
    }
  }

  const p2wpkh = isP2WPKH(script, network)
  if (p2wpkh.payload) {
    return {
      format: addressTypeToName["p2wpkh"],
      ...p2wpkh
    }
  }

  const p2sh = isP2SHScript(script, network)
  if (p2sh.payload) {
    return {
      format: addressTypeToName["p2sh"],
      ...p2sh
    }
  }

  const p2tr = isP2TR(script, network)
  if (p2tr.payload) {
    return {
      format: addressTypeToName["p2tr"],
      ...p2tr
    }
  }

  throw new OrditSDKError("Unsupported input")
}

export function getDummyP2TRInput(): UTXO {
  return {
    n: 1,
    sats: 2885,
    scriptPubKey: {
      asm: "1 29dacd26920d003a894d5f7f263877046a618ce2e7408657b24c74c42b7b80f8",
      desc: "rawtr(29dacd26920d003a894d5f7f263877046a618ce2e7408657b24c74c42b7b80f8)#68kgcmxp",
      hex: "512029dacd26920d003a894d5f7f263877046a618ce2e7408657b24c74c42b7b80f8",
      address: "tb1p98dv6f5jp5qr4z2dtaljvwrhq34xrr8zuaqgv4ajf36vg2mmsruqt5m3lv",
      type: "witness_v1_taproot"
    },
    txid: "3045867081e53f33a4dbd930bf0c121fe30155c767e98895470a572eefc4b7dd",
    safeToSpend: true,
    confirmation: 10
  }
}

export const splitInscriptionId = (inscriptionId: string) => {
  const [txId, index] = inscriptionId.split(":")
  if (txId.length !== 64) {
    throw new OrditSDKError(`Invalid inscriptionId: ${inscriptionId}`)
  }
  const indexNum = parseInt(index, 10)
  if (Number.isNaN(indexNum) || indexNum < 0) {
    throw new OrditSDKError(`Invalid inscriptionId: ${inscriptionId}`)
  }

  return { txId, index: parseInt(index, 10) }
}
