import * as bitcoin from "bitcoinjs-lib"

import { apiConfig } from "../config"
import { Network } from "../config/types"
import { Inscription } from "../inscription/types"
import { Transaction, UTXO, UTXOLimited } from "../transactions/types"
import { decodeObject } from "../utils"
import { rpc } from "./jsonrpc"
import {
  FetchInscriptionOptions,
  FetchInscriptionsOptions,
  FetchSpendablesOptions,
  FetchTxOptions,
  FetchTxResponse,
  FetchUnspentUTXOsOptions,
  FetchUnspentUTXOsResponse,
  RelayTxOptions
} from "./types"

export class OrditApi {
  static readonly #config = apiConfig
  #network: Network = "testnet"

  constructor(network: Network) {
    this.#network = network
  }

  static async fetchUnspentUTXOs({
    address,
    network = "testnet",
    type = "spendable",
    rarity = ["common"],
    decodeMetadata = true
  }: FetchUnspentUTXOsOptions): Promise<FetchUnspentUTXOsResponse> {
    if (!address) {
      throw new Error("Invalid address")
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
          limit: 50
        }
      },
      rpc.id
    )

    const { spendableUTXOs, unspendableUTXOs } = utxos.reduce(
      (acc, utxo) => {
        if (utxo.inscriptions?.length && !utxo.safeToSpend) {
          if (decodeMetadata) {
            utxo.inscriptions = utxo.inscriptions.map((inscription) => {
              inscription.meta = inscription.meta ? decodeObject(inscription.meta) : inscription.meta
              return inscription
            })
          }

          acc.unspendableUTXOs.push(utxo)
        } else {
          acc.spendableUTXOs.push(utxo)
        }

        return acc
      },
      {
        spendableUTXOs: [],
        unspendableUTXOs: []
      } as Record<string, UTXO[]>
    )

    return {
      totalUTXOs: utxos.length,
      spendableUTXOs,
      unspendableUTXOs
    }
  }

  static async fetchTx({
    txId,
    network = "testnet",
    ordinals = true,
    hex = false,
    witness = true,
    decodeMetadata = true
  }: FetchTxOptions): Promise<FetchTxResponse> {
    if (!txId) {
      throw new Error("Invalid txId")
    }

    const tx = await rpc[network].call<Transaction>(
      "GetTransaction",
      {
        txid: txId,
        options: {
          ord: ordinals,
          hex,
          witness
        }
      },
      rpc.id
    )

    if (tx && tx.vout.length && decodeMetadata) {
      tx.vout = tx.vout.map((vout) => {
        vout.inscriptions = vout.inscriptions.map((inscription) => {
          inscription.meta = inscription.meta ? decodeObject(inscription.meta) : inscription.meta
          return inscription
        })

        return vout
      })
    }

    return {
      tx,
      rawTx: hex && tx.hex ? bitcoin.Transaction.fromHex(tx.hex) : undefined
    }
  }

  static async fetchInscriptions({ outpoint, network = "testnet", decodeMetadata = true }: FetchInscriptionsOptions) {
    if (!outpoint) {
      throw new Error("Invalid options provided.")
    }

    let inscriptions = await rpc[network].call<Inscription[]>(
      "GetInscriptions",
      {
        outpoint,
        network
      },
      rpc.id
    )

    if (decodeMetadata) {
      inscriptions = inscriptions.map((inscription) => {
        inscription.meta = inscription.meta ? decodeObject(inscription.meta) : inscription.meta
        return inscription
      })
    }

    return inscriptions
  }

  static async fetchInscription({ id, network = "testnet", decodeMetadata = true }: FetchInscriptionOptions) {
    if (!id) {
      throw new Error("Invalid options provided.")
    }

    const inscription = await rpc[network].call<Inscription>(
      "GetInscription",
      {
        id,
        network
      },
      rpc.id
    )

    inscription.meta = inscription.meta && decodeMetadata ? decodeObject(inscription.meta) : inscription.meta

    return inscription
  }

  static async fetchSpendables({
    address,
    value,
    rarity = ["common"],
    filter = [],
    limit = 200,
    network = "testnet",
    type = "spendable"
  }: FetchSpendablesOptions) {
    if (!address || !value) {
      throw new Error("Invalid options provided")
    }

    return rpc[network].call<UTXOLimited[]>(
      "GetSpendables",
      {
        address,
        value,
        safetospend: type === "spendable",
        allowedrarity: rarity,
        filter,
        limit
      },
      rpc.id
    )
  }

  static async relayTx({ hex, network = "testnet", maxFeeRate }: RelayTxOptions): Promise<string> {
    if (!hex) {
      throw new Error("Invalid tx hex")
    }

    if (maxFeeRate && (maxFeeRate < 0 || isNaN(maxFeeRate))) {
      throw new Error("Invalid max fee rate")
    }

    return rpc[network].call<string>(
      "SendRawTransaction",
      {
        hex,
        maxFeeRate
      },
      rpc.id
    )
  }
}
