import * as ecc from "@bitcoinerlab/secp256k1"
import { BIP32Factory } from "bip32"
import { Psbt } from "bitcoinjs-lib"

import { getAddressType } from "../addresses"
import { addressTypeToName } from "../addresses/formats"
import { OrditApi } from "../api"
import { Network } from "../config/types"
import { calculateTxFee, createTransaction, getNetwork, toXOnly } from "../utils"
import { GetWalletOptions } from "../wallet"
import { UTXO } from "./types"

const bip32 = BIP32Factory(ecc)

export async function createPsbt({
  network,
  pubKey,
  ins,
  outs,
  satsPerByte = 10,
  safeMode = "on",
  enableRBF = true
}: CreatePsbtOptions) {
  if (!ins.length || !outs.length) {
    throw new Error("Invalid request")
  }
  const { address } = ins[0]
  const { spendableUTXOs, unspendableUTXOs, totalUTXOs } = await OrditApi.fetchUnspentUTXOs({
    address,
    network,
    type: safeMode === "off" ? "all" : "spendable"
  })

  if (!totalUTXOs) {
    throw new Error("No spendable UTXOs")
  }

  const nativeNetwork = getNetwork(network)
  const psbt = new Psbt({ network: nativeNetwork })
  const inputSats = spendableUTXOs
    .concat(safeMode === "off" ? unspendableUTXOs : [])
    .reduce((acc, utxo) => (acc += utxo.sats), 0)
  const outputSats = outs.reduce((acc, utxo) => (acc += utxo.cardinals), 0)

  // add inputs
  const witnessScripts: Buffer[] = []
  for (const utxo of spendableUTXOs) {
    if (utxo.scriptPubKey.address !== address) continue

    const payload = await processInput(utxo, pubKey, network, enableRBF)
    payload.witnessUtxo?.script && witnessScripts.push(payload.witnessUtxo?.script)
    psbt.addInput(payload)
  }

  const fees = calculateTxFee({
    totalInputs: totalUTXOs, // select only relevant utxos to spend. NOT ALL!
    totalOutputs: outs.length,
    satsPerByte,
    type: addressTypeToName[getAddressType(address, network)],
    additional: { witnessScripts }
  })

  const remainingBalance = inputSats - outputSats - fees
  if (remainingBalance < 0) {
    throw new Error(`Insufficient balance. Available: ${inputSats}. Attemping to spend: ${outputSats}. Fees: ${fees}`)
  }

  const isChangeOwed = remainingBalance > 600
  if (isChangeOwed) {
    outs.push({
      address,
      cardinals: remainingBalance
    })
  }

  // add outputs
  outs.forEach((out) => {
    psbt.addOutput({
      address: out.address,
      value: out.cardinals
    })
  })

  return {
    hex: psbt.toHex(),
    base64: psbt.toBase64()
  }
}

export async function processInput(utxo: UTXO, pubKey: string, network: Network, enableRBF = true): Promise<InputType> {
  switch (utxo.scriptPubKey.type) {
    case "witness_v1_taproot":
      return generateTaprootInput(utxo, pubKey, network, enableRBF)

    case "witness_v0_scripthash":
      return generateSegwitInput(utxo, pubKey, network, enableRBF)

    case "scripthash":
      return generateNestedSegwitInput(utxo, pubKey, network, enableRBF)

    case "pubkeyhash":
      return generateLegacyInput(utxo, network, enableRBF)

    default:
      throw new Error("invalid script pub type")
  }
}

function generateTaprootInput(utxo: UTXO, pubKey: string, network: Network, enableRPF = true): TaprootInputType {
  const chainCode = Buffer.alloc(32)
  chainCode.fill(1)

  const key = bip32.fromPublicKey(Buffer.from(pubKey, "hex"), chainCode, getNetwork(network))
  const childNodeXOnlyPubkey = toXOnly(key.publicKey)

  const p2tr = createTransaction(childNodeXOnlyPubkey, "p2tr", network)
  if (!p2tr || !p2tr.output) {
    throw new Error("Unable to process p2tr input")
  }

  return {
    hash: utxo.txid,
    index: utxo.n,
    sequence: enableRPF ? 0xfffffffd : undefined,
    tapInternalKey: childNodeXOnlyPubkey,
    witnessUtxo: {
      script: p2tr.output,
      value: utxo.sats
    }
  }
}

function generateSegwitInput(utxo: UTXO, pubKey: string, network: Network, enableRPF = true): SegwitInputType {
  const p2wpkh = createTransaction(Buffer.from(pubKey, "hex"), "p2wpkh", network)
  if (!p2wpkh || !p2wpkh.output) {
    throw new Error("Unable to process Segwit input")
  }

  return {
    hash: utxo.txid,
    index: utxo.n,
    sequence: enableRPF ? 0xfffffffd : undefined,
    witnessUtxo: {
      script: p2wpkh.output,
      value: utxo.sats
    }
  }
}

function generateNestedSegwitInput(
  utxo: UTXO,
  pubKey: string,
  network: Network,
  enableRPF = true
): NestedSegwitInputType {
  const p2sh = createTransaction(Buffer.from(pubKey, "hex"), "p2sh", network)
  if (!p2sh || !p2sh.output || !p2sh.redeem) {
    throw new Error("Unable to process Segwit input")
  }

  return {
    hash: utxo.txid,
    index: utxo.n,
    sequence: enableRPF ? 0xfffffffd : undefined,
    redeemScript: p2sh.redeem.output,
    witnessUtxo: {
      script: p2sh.output,
      value: utxo.sats
    }
  }
}

async function generateLegacyInput(utxo: UTXO, network: Network, enableRPF = true): Promise<LegacyInputType> {
  const { tx } = await OrditApi.fetchTx({ txId: utxo.txid, hex: true, ordinals: false, network })
  if (!tx) {
    throw new Error("Unable to process Legacy input")
  }

  return {
    hash: utxo.txid,
    index: utxo.n,
    sequence: enableRPF ? 0xfffffffd : undefined,
    nonWitnessUtxo: Buffer.from(tx.hex!, "hex")
  }
}

// TODO: replace below interfaces and custom types w/ PsbtInputExtended from bitcoinjs-lib
interface TaprootInputType {
  hash: string
  index: number
  sequence?: number
  tapInternalKey?: Buffer
  witnessUtxo?: {
    script: Buffer
    value: number
  }
  nonWitnessUtxo?: never
}

interface SegwitInputType {
  hash: string
  index: number
  sequence?: number
  witnessUtxo?: {
    script: Buffer
    value: number
  }
  nonWitnessUtxo?: never
}

interface NestedSegwitInputType {
  hash: string
  index: number
  sequence?: number
  redeemScript?: Buffer | undefined
  witnessUtxo?: {
    script: Buffer
    value: number
  }
  nonWitnessUtxo?: never
}

interface LegacyInputType {
  hash: string
  index: number
  sequence?: number
  nonWitnessUtxo?: Buffer
  witnessUtxo?: never
}

type InputType = TaprootInputType | SegwitInputType | NestedSegwitInputType | LegacyInputType

export type CreatePsbtOptions = GetWalletOptions & {
  satsPerByte?: number
  ins: any[]
  outs: any[]
  enableRBF: boolean
}
