import { Network } from "../config/types";
import { Rarity } from "../inscription/types";

export interface UTXO {
  n: number;
  txHash: string;
  blockHash: string;
  blockN: number;
  sats: number;
  scriptPubKey: ScriptPubKey;
  txid: string;
  value: number;
  ordinals?: OrdinalsEntity[] | null;
  inscriptions?: InscriptionsEntity[] | null;
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

export interface OrdinalsEntity {
  number: number;
  decimal: string;
  degree: string;
  name: string;
  height: number;
  cycle: number;
  epoch: number;
  period: number;
  offset: number;
  rarity: string;
  output: string;
  start: number;
  size: number;
}

export interface InscriptionsEntity {
  id: string;
  outpoint: string;
  owner: string;
  fee: number;
  height: number;
  number: number;
  sat: number;
  timestamp: number;
  media_type: string;
  media_size: number;
  media_content: string;
  meta?: Record<string, any>;
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