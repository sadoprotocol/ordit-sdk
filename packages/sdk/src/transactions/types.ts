import { Inscription, Ordinal } from "../inscription/types"
import { JsonRpcPagination } from "../modules"

export type Vout = {
  value: number
  n: number
  ordinals: Ordinal[]
  inscriptions: Inscription[]
  spent: string | false
  sats: number
  scriptPubKey: {
    asm: string
    desc: string
    hex: string
    reqSigs?: number
    type: string
    addresses?: string[]
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
  txinwitness?: string[]
  sequence: number
  value: number
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
  blockheight: number
  blocktime: number
  confirmations: number
  time: number
  weight: number
  fee: number
}

// used in Address.GetTransactions RPC, needed due to response not matching Transaction type (ex. blockhash vs blockHash)
export type TransactionV2 = Omit<Transaction, "blockhash" | "blockheight" | "blocktime"> & {
  blockHash: string
  blockHeight: number
  blockTime: number
}

export type Transactions = {
  transactions: TransactionV2[]
  options: {
    ord: boolean
    hex: boolean
    witness: boolean
  }
  pagination: JsonRpcPagination
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

export type TaptreeVersion = "1" | "2"
