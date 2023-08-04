import * as ecc from "@bitcoinerlab/secp256k1"
import { BIP32Factory } from "bip32"
import { Psbt, Transaction } from "bitcoinjs-lib"

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

    const payload = await processInput({ utxo, pubKey, network, enableRBF })
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

export async function processInput({
  utxo,
  pubKey,
  network,
  enableRBF = true,
  ...options
}: Omit<ProcessInputOptions, "rawTx">): Promise<InputType> {
  const { rawTx } = await OrditApi.fetchTx({ txId: utxo.txid, network, hex: true })

  switch (utxo.scriptPubKey.type) {
    case "witness_v1_taproot":
      return generateTaprootInput({ utxo, pubKey, network, rawTx, enableRBF, ...options })

    case "witness_v0_scripthash":
      return generateSegwitInput({ utxo, pubKey, network, rawTx, enableRBF, ...options })

    case "scripthash":
      return generateNestedSegwitInput({ utxo, pubKey, network, rawTx, enableRBF, ...options })

    case "pubkeyhash":
      return generateLegacyInput({ utxo, rawTx, enableRBF, ...options })

    default:
      throw new Error("invalid script pub type")
  }
}

function generateTaprootInput({
  utxo,
  pubKey,
  network,
  enableRBF,
  sighashType,
  rawTx
}: ProcessInputOptions): TaprootInputType {
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
    sequence: enableRBF ? 0xfffffffd : undefined,
    tapInternalKey: childNodeXOnlyPubkey,
    nonWitnessUtxo: rawTx?.toBuffer() ?? undefined,
    witnessUtxo: {
      script: p2tr.output,
      value: utxo.sats
    },
    ...(sighashType ? { sighashType } : undefined)
  }
}

function generateSegwitInput({ utxo, pubKey, network, enableRBF, sighashType }: ProcessInputOptions): SegwitInputType {
  const p2wpkh = createTransaction(Buffer.from(pubKey, "hex"), "p2wpkh", network)
  if (!p2wpkh || !p2wpkh.output) {
    throw new Error("Unable to process Segwit input")
  }

  return {
    hash: utxo.txid,
    index: utxo.n,
    sequence: enableRBF ? 0xfffffffd : undefined,
    witnessUtxo: {
      script: p2wpkh.output,
      value: utxo.sats
    },
    ...(sighashType ? { sighashType } : undefined)
  }
}

function generateNestedSegwitInput({
  utxo,
  pubKey,
  network,
  enableRBF,
  sighashType
}: ProcessInputOptions): NestedSegwitInputType {
  const p2sh = createTransaction(Buffer.from(pubKey, "hex"), "p2sh", network)
  if (!p2sh || !p2sh.output || !p2sh.redeem) {
    throw new Error("Unable to process Segwit input")
  }

  return {
    hash: utxo.txid,
    index: utxo.n,
    sequence: enableRBF ? 0xfffffffd : undefined,
    redeemScript: p2sh.redeem.output,
    witnessUtxo: {
      script: p2sh.output,
      value: utxo.sats
    },
    ...(sighashType ? { sighashType } : undefined)
  }
}

async function generateLegacyInput({
  utxo,
  enableRBF,
  sighashType,
  rawTx
}: Omit<ProcessInputOptions, "pubKey" | "network">): Promise<LegacyInputType> {
  if (!rawTx) {
    throw new Error("Unable to process Legacy input")
  }

  return {
    hash: utxo.txid,
    index: utxo.n,
    sequence: enableRBF ? 0xfffffffd : undefined,
    nonWitnessUtxo: rawTx.toBuffer(),
    ...(sighashType ? { sighashType } : undefined)
  }
}

// TODO: replace below interfaces and custom types w/ PsbtInputExtended from bitcoinjs-lib
interface TaprootInputType {
  hash: string
  index: number
  sequence?: number
  sighashType?: number
  tapInternalKey?: Buffer
  witnessUtxo?: {
    script: Buffer
    value: number
  }
  nonWitnessUtxo?: Buffer
}

interface SegwitInputType {
  hash: string
  index: number
  sequence?: number
  sighashType?: number
  witnessUtxo?: {
    script: Buffer
    value: number
  }
  nonWitnessUtxo?: Buffer
}

interface NestedSegwitInputType {
  hash: string
  index: number
  sequence?: number
  sighashType?: number
  redeemScript?: Buffer | undefined
  witnessUtxo?: {
    script: Buffer
    value: number
  }
  nonWitnessUtxo?: Buffer
}

interface LegacyInputType {
  hash: string
  index: number
  sequence?: number
  sighashType?: number
  nonWitnessUtxo?: Buffer
  witnessUtxo?: never
}

export type InputType = TaprootInputType | SegwitInputType | NestedSegwitInputType | LegacyInputType

export type CreatePsbtOptions = GetWalletOptions & {
  satsPerByte?: number
  ins: any[]
  outs: any[]
  enableRBF: boolean
}

interface ProcessInputOptions {
  utxo: UTXO
  pubKey: string
  network: Network
  enableRBF?: boolean
  sighashType?: number
  rawTx?: Transaction
}
