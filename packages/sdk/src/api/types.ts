import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { Network } from "../config/types"
import { Rarity } from "../inscription/types"
import { Transaction, UTXO } from "../transactions/types"
import { RequireAtLeastOne } from "../utils/types"

export interface FetchUnspentUTXOsOptions {
  address: string
  network?: Network
  type?: "all" | "spendable"
  rarity?: Rarity[]
  decodeMetadata?: boolean
  sort?: "asc" | "desc"
  limit?: number
  next?: string | null
}

export interface FetchUnspentUTXOsResponse {
  totalUTXOs: number
  spendableUTXOs: UTXO[]
  unspendableUTXOs: UTXO[]
}

export interface FetchTxOptions {
  txId: string
  network?: Network
  ordinals?: boolean
  hex?: boolean
  witness?: boolean
  decodeMetadata?: boolean
}

export interface FetchTxResponse {
  tx: Transaction
  rawTx?: BTCTransaction
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
  network?: Network
}

export interface FetchInscriptionOptions {
  id: string
  network?: Network
  decodeMetadata?: boolean
}

export interface RelayTxOptions {
  hex: string
  maxFeeRate?: number
  network?: Network
  validate?: boolean
}

export interface FetchSpendablesOptions {
  address: string
  value: number
  type?: "all" | "spendable"
  rarity?: Rarity[]
  filter?: string[]
  limit?: number
  network?: Network
}

export interface GetBalanceOptions {
  address: string
  network?: Network
}
