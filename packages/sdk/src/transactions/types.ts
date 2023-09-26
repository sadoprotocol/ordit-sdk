import { Inscription, Ordinal } from "../inscription/types"

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
