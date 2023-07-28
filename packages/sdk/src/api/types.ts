import { Network } from "../config/types";
import { Inscription, Ordinal, Rarity } from "../inscription/types";

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

export interface ScriptPubKey {
  asm: string;
  desc: string;
  hex: string;
  address: string;
  type: string;
}

export interface FetchUnspentUTXOsOptions {
  address: string
  network?: Network
  type?: "all" | "spendable"
  rarity?: Rarity[]
  txHex?: boolean
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