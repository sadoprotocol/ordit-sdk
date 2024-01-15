import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { Rarity } from "../inscription/types"
import { Transaction, UTXO } from "../transactions/types"
import { RequireAtLeastOne } from "../utils/types"

export interface GetUnspentsOptions {
  address: string
  type?: "all" | "spendable"
  rarity?: Rarity[]
  sort?: "asc" | "desc"
  limit?: number
  next?: string | null
}

export interface GetUnspentsResponse {
  totalUTXOs: number
  spendableUTXOs: UTXO[]
  unspendableUTXOs: UTXO[]
}

export interface GetTransactionOption {
  txId: string
  ordinals?: boolean
  hex?: boolean
  witness?: boolean
  decodeMetadata?: boolean
}

export interface GetTransactionsOption {
  address: string
  ordinals?: boolean
  hex?: boolean
  witness?: boolean
  limit?: number
  next?: string | null
}

export interface FetchTxResponse {
  tx: Transaction
  rawTx?: BTCTransaction
}

export interface GetInscriptionUTXOOptions {
  id: string
}

export type GetInscriptionsOptions = RequireAtLeastOne<{
  creator?: string
  owner?: string
  mimeType?: string
  mimeSubType?: string
  outpoint?: string
}> & {
  sort?: "asc" | "desc"
  limit?: number
  next?: string | null
  decodeMetadata?: boolean
  includePostage?: boolean
}

export interface GetInscriptionOptions {
  id: string
  decodeMetadata?: boolean
}

export interface RelayOptions {
  hex: string
  maxFeeRate?: number
  validate?: boolean
}

export interface GetSpendablesOptions {
  address: string
  value: number
  type?: "all" | "spendable"
  rarity?: Rarity[]
  filter?: string[]
  limit?: number
}

export interface GetBalanceOptions {
  address: string
}
