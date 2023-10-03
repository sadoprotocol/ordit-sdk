import { Network } from "~/config/types"
import { Inscription, Ordinal } from "~/inscription/types"
import { BaseDatasource } from "~/modules"
import { OnOffUnion } from "~/wallet"

export type Vout = {
  value: number
  n: number
  ordinals: Ordinal[]
  inscriptions: Inscription[]
  spent: string | false
  scriptPubKey: {
    asm: string
    desc: string
    hex: string
    reqSigs?: number
    type: string
    addresses: string[]
    address?: string
  }
}

export type Vin = {
  txid: string
  vout: number
  scriptSig: {
    asm: string
    hex: string
  }
  txinwitness: string[]
  sequence: number
}

export type Transaction = {
  hex?: string
  txid: string
  hash: string
  size: number
  vsize: number
  version: number
  locktime: number
  vin: Vin[]
  vout: Vout[]
  blockhash: string
  confirmations: number
  time: number
  blocktime: number
  weight: number
  fee: number
  blockheight: number
}

export interface ScriptPubKey {
  asm: string
  desc: string
  hex: string
  address: string
  type: string
}

export interface UTXO {
  n: number
  txid: string
  sats: number
  scriptPubKey: ScriptPubKey
  safeToSpend: boolean
  confirmation: number
}

export type UTXOLimited = Pick<UTXO, "txid" | "n" | "sats" | "scriptPubKey">

export interface Output {
  address: string
  value: number
}

export interface SkipStrictSatsCheckOptions {
  skipStrictSatsCheck?: boolean
  customAmount?: number
}

export type InputType = LegacyInputType | SegwitInputType | NestedSegwitInputType | TaprootInputType

// TODO: replace below interfaces and custom types w/ PsbtInputExtended from bitcoinjs-lib
export interface BaseInputType {
  hash: string
  index: number
  sighashType?: number
}

export type LegacyInputType = BaseInputType & {
  type: "legacy"
  nonWitnessUtxo?: Buffer
  witnessUtxo?: {
    script: Buffer
    value: number
  }
}

export type SegwitInputType = BaseInputType & {
  type: "segwit"
  witnessUtxo?: {
    script: Buffer
    value: number
  }
  witness?: Buffer[]
}

export type TaprootInputType = BaseInputType &
  Omit<SegwitInputType, "type"> & {
    type: "taproot"
    tapInternalKey: Buffer
    tapLeafScript?: TapLeafScript[]
  }

export type NestedSegwitInputType = BaseInputType &
  Omit<SegwitInputType, "type"> & {
    type: "nested-segwit"
    redeemScript: Buffer
  }

export type CreatePsbtOptions = {
  satsPerByte: number
  address: string
  outputs: Output[]
  enableRBF?: boolean
  pubKey: string
  network: Network
  safeMode?: OnOffUnion
}

export interface ProcessInputOptions {
  utxo: UTXO | UTXOLimited
  pubKey: string
  network: Network
  sighashType?: number
  witness?: Buffer[]
  datasource?: BaseDatasource
}

export interface TapScript {
  leafVersion: number
  script: Buffer
}
export declare type ControlBlock = Buffer
export interface TapLeafScript extends TapScript {
  controlBlock: ControlBlock
}
