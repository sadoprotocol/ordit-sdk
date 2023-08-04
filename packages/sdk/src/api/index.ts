import * as bitcoin from "bitcoinjs-lib";

import { apiConfig } from "../config";
import { Network } from "../config/types";
import { Inscription } from "../inscription/types";
import { Transaction, UTXO } from "../transactions/types";
import { rpc } from "./jsonrpc";
import { FetchInscriptionsOptions, FetchTxOptions, FetchTxResponse, FetchUnspentUTXOsOptions, FetchUnspentUTXOsResponse, RelayTxOptions } from "./types";

export class OrditApi {
  static readonly #config = apiConfig;
  #network: Network = "testnet";

  constructor(network: Network) {
    this.#network = network;
  }

  static async fetchUnspentUTXOs({ address, network = 'testnet', type = "spendable", rarity = ["common"] }: FetchUnspentUTXOsOptions): Promise<FetchUnspentUTXOsResponse> {
    if(!address) {
      throw new Error('Invalid address')
    }

    const utxos = await rpc[network].call<UTXO[]>(
      "GetUnspents",
      {
        address,
        options: {
          allowedrarity: rarity,
          safetospend: type === "spendable"
        },
        pagination: {
          page: 1,
          limit: 25
        }
      },
      rpc.id
    )

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
    if(!txId) {
      throw new Error("Invalid txId")
    }

    const tx = await rpc[network].call<Transaction>('GetTransaction', {
      txid: txId, 
      options: {
        ord: ordinals, 
        hex, 
        witness
      }
    }, rpc.id);

    return {
      tx,
      rawTx: hex && tx.hex ? bitcoin.Transaction.fromHex(tx.hex): undefined
    }
  }

  static async fetchInscriptions({ outpoint, network = "testnet" }: FetchInscriptionsOptions) {
    if (!outpoint) {
      throw new Error("Invalid options provided.");
    }

    return rpc[network].call<Inscription[]>('GetInscriptions', {
      outpoint, network
    }, rpc.id);
  }

  static async relayTx({ hex, network = "testnet", maxFeeRate }: RelayTxOptions): Promise<string> {
    if (!hex) {
      throw new Error("Invalid tx hex");
    }

    if(maxFeeRate && (maxFeeRate < 0 || isNaN(maxFeeRate))) {
      throw new Error("Invalid max fee rate")
    }

    return rpc[network].call<string>('SendRawTransaction', {
      hex, maxFeeRate 
    }, rpc.id)
  }
}