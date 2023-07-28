import * as bitcoin from "bitcoinjs-lib";
import { fetch as _fetch } from "cross-fetch";

import { apiConfig } from "../config";
import { Network } from "../config/types";
import { rpc } from "./jsonrpc";
import { FetchTxOptions, FetchUnspentUTXOsOptions, FetchUnspentUTXOsResponse, UTXO } from "./types";

export class OrditApi {
  static readonly #config = apiConfig;
  #network: Network = "testnet";

  constructor(network: Network) {
    this.#network = network;
  }

  static async fetch<T>(uri: string, options: FetchOptions): Promise<T> {
    const fullUri = this.#config.apis[options.network].batter + uri;

    try {
      const response = await _fetch(fullUri, {
        method: "POST",
        body: JSON.stringify(options.data),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      });
      const data = await response.json();

      return data;
    } catch (error: any) {
      throw new Error(error);
    }
  }

  static async fetchUnspentUTXOs({ address, network = 'testnet', type = "spendable", txHex = false, rarity = ["common"] }: FetchUnspentUTXOsOptions): Promise<FetchUnspentUTXOsResponse> {
    if(!address) {
      throw new Error('Invalid address')
    }

    const utxos = await rpc[network].call<UTXO[]>('GetUnspents', { 
      address, 
      options: {
        allowedrarity: rarity,
        notsafetospend: type !== "all",
        txhex: txHex,
      }
    }, rpc.id)

    const { spendableUTXOs, unspendableUTXOs } = utxos.reduce((acc, utxo) => {
      if(utxo.inscriptions?.length && !utxo.safeToSpend) {
        acc.unspendableUTXOs.push(utxo)
      } else {
        acc.spendableUTXOs.push(utxo)
      }

      return acc
    }, {
      spendableUTXOs: [],
      unspendableUTXOs: [],
    } as Record<string, UTXO[]>)
    
    return {
      totalUTXOs: utxos.length,
      spendableUTXOs,
      unspendableUTXOs
    }
  }

  static async fetchTx({ txId, network = "testnet", ordinals = true, hex = false, witness = true }: FetchTxOptions): Promise<any> {
    if(txId) {
      throw new Error("Invalid txId")
    }

    const tx = await rpc[network].call<any>('GetTransaction', {
      txid: txId, ord: ordinals, hex, witness
    }, rpc.id);

    return {
      tx,
      rawTx: hex ? bitcoin.Transaction.fromHex(tx.hex): undefined
    }
  }

  static async fetchInscriptionDetails({ outpoint, network = "testnet" }: FetchInscriptionDetailsOptions) {
    if (!outpoint) {
      throw new Error("Invalid options provided.");
    }

    const fullUri = `${this.#config.apis[network].batter}/utxo/inscriptions/${outpoint}`;

    try {
      const response = await _fetch(fullUri);

      const data: InscriptionDetailsEntity = await response.json();

      return data;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }
}

export type FetchOptions = {
  data: any;
  network: Network;
};

export type FetchInscriptionsOptions = {
  address: string;
  network?: Network;
};

export type FetchInscriptionDetailsOptions = {
  outpoint: string;
  network?: Network;
};

export interface RdataEntity {
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

export interface InscriptionDetailsEntity {
  success: boolean;
  message: string;
  rdata?: InscriptionsEntity[] | null;
}
