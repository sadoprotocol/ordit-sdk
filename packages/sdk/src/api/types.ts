import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { Rarity } from "../inscription/types"
import { JsonRpcPagination } from "../modules/types"
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

export interface GetTxOptions {
  txId: string
  ordinals?: boolean
  hex?: boolean
  witness?: boolean
  decodeMetadata?: boolean
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

export interface GetTokenOptions {
  tick: string
}

export interface GetTransfersOptions {
  filter: RequireAtLeastOne<{
    inscription?: string
    tick?: string
    from?: string
    to?: string
  }>
  pagination?: JsonRpcPagination
}

export interface GetTransfersResponse {
  transfers: Array<{
    inscription: string
    tick: string
    slug: string
    amount: number
    from: {
      address: string
      block: number
      timestamp: number
    }
    to: {
      address: string
      block: number
      timestamp: number
    }
  }>
  pagination?: JsonRpcPagination
}

export interface GetAddressTokensOptions {
  address: string
}

export interface GetAddressTokensResponse {
  address: string
  tick: string
  slug: string
  total: number
  available: number
  transferable: number
}
