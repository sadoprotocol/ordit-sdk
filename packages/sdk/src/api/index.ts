import * as bitcoin from "bitcoinjs-lib";

import { apiConfig } from "../config";
import { Network } from "../config/types";
import { Inscription } from "../inscription/types";
import { Transaction } from "../transactions/types";
import { rpc } from "./jsonrpc";
import { FetchInscriptionsOptions, FetchTxOptions, FetchTxResponse, FetchUnspentUTXOsOptions, FetchUnspentUTXOsResponse, UTXO } from "./types";

export class OrditApi {
  static readonly #config = apiConfig;
  #network: Network = "testnet";

  constructor(network: Network) {
    this.#network = network;
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

  static async fetchTx({ txId, network = "testnet", ordinals = true, hex = false, witness = true }: FetchTxOptions): Promise<FetchTxResponse> {
    if(txId) {
      throw new Error("Invalid txId")
    }

    const tx = await rpc[network].call<Transaction>('GetTransaction', {
      txid: txId, ord: ordinals, hex, witness
    }, rpc.id);

    return {
      tx,
      rawTx: hex && tx.hex ? bitcoin.Transaction.fromHex(tx.hex): undefined
    }
  }

  static async fetchInscriptions({ outpoint, network = "testnet" }: FetchInscriptionsOptions): Promise<Inscription[]> {
    if (!outpoint) {
      throw new Error("Invalid options provided.");
    }

    return rpc[network].call<any>('GetInscriptions', {
      outpoint, network
    }, rpc.id);
  }
}