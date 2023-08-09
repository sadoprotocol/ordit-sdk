import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { Network } from "../config/types"
import { Rarity } from "../inscription/types"
import { Transaction, UTXO } from "../transactions/types"

export interface FetchUnspentUTXOsOptions {
  address: string
  network?: Network
  type?: "all" | "spendable"
  rarity?: Rarity[]
  decodeMetadata?: boolean
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

export interface FetchInscriptionsOptions {
  outpoint: string
  network?: Network
  decodeMetadata?: boolean
}

export interface RelayTxOptions {
  hex: string
  maxFeeRate?: number
  network?: Network
}
