import * as ecc from "@bitcoinerlab/secp256k1"
import { BIP32Factory } from "bip32"
import { Psbt, Transaction } from "bitcoinjs-lib"

import { getAddressType } from "../addresses"
import { addressTypeToName } from "../addresses/formats"
import { OrditApi } from "../api"
import { Network } from "../config/types"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
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
  for (const [index, utxo] of spendableUTXOs.entries()) {
    if (utxo.scriptPubKey.address !== address) continue

    const payload = await processInput({ utxo, pubKey, network })
    payload.witnessUtxo?.script && witnessScripts.push(payload.witnessUtxo?.script)
    psbt.addInput(payload)

    if (enableRBF) {
      psbt.setInputSequence(index, 0xfffffffd)
    }
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

  const isChangeOwed = remainingBalance > MINIMUM_AMOUNT_IN_SATS
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
  ...options
}: Omit<ProcessInputOptions, "rawTx">): Promise<InputType> {
  switch (utxo.scriptPubKey.type) {
    case "witness_v1_taproot":
      return generateTaprootInput({ utxo, pubKey, network, ...options })

    case "witness_v0_scripthash":
    case "witness_v0_keyhash":
      return generateSegwitInput({ utxo, pubKey, network, ...options })

    case "scripthash":
      return generateNestedSegwitInput({ utxo, pubKey, network, ...options })

    case "pubkeyhash":
      const { rawTx } = await OrditApi.fetchTx({ txId: utxo.txid, network, hex: true })
      return generateLegacyInput({ utxo, rawTx, ...options })

    default:
      throw new Error("invalid script pub type")
  }
}

function generateTaprootInput({
  utxo,
  pubKey,
  network,
  sighashType
}: Omit<ProcessInputOptions, "rawTx">): TaprootInputType {
  const chainCode = Buffer.alloc(32)
  chainCode.fill(1)

  const key = bip32.fromPublicKey(Buffer.from(pubKey, "hex"), chainCode, getNetwork(network))
  const xOnlyPubKey = toXOnly(key.publicKey)

  if (!utxo.scriptPubKey.hex) {
    throw new Error("Unable to process p2tr input")
  }

  return {
    hash: utxo.txid,
    index: utxo.n,
    tapInternalKey: xOnlyPubKey,
    witnessUtxo: {
      script: Buffer.from(utxo.scriptPubKey.hex, "hex"),
      value: utxo.sats
    },
    ...(sighashType ? { sighashType } : undefined)
  }
}

function generateSegwitInput({ utxo, sighashType }: ProcessInputOptions): BaseInputType {
  if (!utxo.scriptPubKey.hex) {
    throw new Error("Unable to process Segwit input")
  }

  return {
    hash: utxo.txid,
    index: utxo.n,
    witnessUtxo: {
      script: Buffer.from(utxo.scriptPubKey.hex, "hex"),
      value: utxo.sats
    },
    ...(sighashType ? { sighashType } : undefined)
  }
}

function generateNestedSegwitInput({ utxo, pubKey, network, sighashType }: ProcessInputOptions): NestedSegwitInputType {
  const p2sh = createTransaction(Buffer.from(pubKey, "hex"), "p2sh", network)
  if (!p2sh || !p2sh.output || !p2sh.redeem) {
    throw new Error("Unable to process Segwit input")
  }

  return {
    hash: utxo.txid,
    index: utxo.n,
    redeemScript: p2sh.redeem.output!,
    witnessUtxo: {
      script: Buffer.from(utxo.scriptPubKey.hex, "hex"),
      value: utxo.sats
    },
    ...(sighashType ? { sighashType } : undefined)
  }
}

async function generateLegacyInput({
  utxo,
  sighashType,
  rawTx
}: Omit<ProcessInputOptions, "pubKey" | "network">): Promise<BaseInputType> {
  return {
    hash: utxo.txid,
    index: utxo.n,
    nonWitnessUtxo: rawTx?.toBuffer(),
    ...(sighashType ? { sighashType } : undefined)
  }
}

// TODO: replace below interfaces and custom types w/ PsbtInputExtended from bitcoinjs-lib
interface BaseInputType {
  hash: string
  index: number
  sighashType?: number
  witnessUtxo?: {
    script: Buffer
    value: number
  }
  nonWitnessUtxo?: Buffer
}

type TaprootInputType = BaseInputType & {
  tapInternalKey: Buffer
}

type NestedSegwitInputType = BaseInputType & {
  redeemScript: Buffer
}

export type InputType = BaseInputType | TaprootInputType | NestedSegwitInputType

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
  sighashType?: number
  rawTx?: Transaction
}
