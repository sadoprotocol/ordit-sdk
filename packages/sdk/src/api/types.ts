import { Transaction as BTCTransaction } from 'bitcoinjs-lib'

import { Network } from "../config/types";
import { Inscription, Ordinal, Rarity } from "../inscription/types";
import { ScriptPubKey, Transaction } from "../transactions/types";

export interface UTXO {
  n: number;
  txHash: string;
  blockHash: string;
  blockN: number;
  sats: number;
  scriptPubKey: ScriptPubKey;
  txid: string;
  value: number;
  ordinals?: Ordinal[] | null;
  inscriptions?: Inscription[] | null;
  safeToSpend: boolean;
  confirmation: number;
}

export interface FetchUnspentUTXOsOptions {
  address: string
  network?: Network
  type?: "all" | "spendable"
  rarity?: Rarity[]
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
}

export interface FetchTxResponse {
  tx: Transaction
  rawTx?: BTCTransaction
}

export interface FetchInscriptionsOptions {
  outpoint: string
  network?: Network
}