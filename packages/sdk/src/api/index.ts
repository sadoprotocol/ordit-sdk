import * as bitcoin from "bitcoinjs-lib"

import { Inscription } from "../inscription/types"
import { Transaction, UTXO, UTXOLimited } from "../transactions/types"
import { decodeObject } from "../utils"
import { rpc } from "./jsonrpc"
import {
  FetchInscriptionOptions,
  FetchSpendablesOptions,
  FetchTxOptions,
  FetchTxResponse,
  FetchUnspentUTXOsOptions,
  FetchUnspentUTXOsResponse,
  GetBalanceOptions,
  GetInscriptionsOptions,
  RelayTxOptions
} from "./types"

/**
 * @deprecated `OrditApi` has been deprecated and will be removed in future release. Use `JsonRpcDatasource` instead
 */
export class OrditApi {
  static transformInscriptions(inscriptions: Inscription[] | undefined) {
    if (!inscriptions) return []

    return inscriptions.map((inscription) => {
      inscription.meta = inscription.meta ? decodeObject(inscription.meta) : inscription.meta
      return inscription
    })
  }

  static async fetchUnspentUTXOs({
    address,
    network = "testnet",
    type = "spendable",
    rarity = ["common"],
    decodeMetadata = false,
    sort = "desc"
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
          limit: 50
        },
        sort: { value: sort }
      },
      rpc.id
    )

    const { spendableUTXOs, unspendableUTXOs } = utxos.reduce(
      (acc, utxo) => {
        if (utxo.inscriptions?.length && !utxo.safeToSpend) {
          utxo.inscriptions = decodeMetadata ? this.transformInscriptions(utxo.inscriptions) : utxo.inscriptions

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
    decodeMetadata = false
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

    tx.vout = tx.vout.map((vout) => {
      vout.inscriptions = decodeMetadata ? this.transformInscriptions(vout.inscriptions) : vout.inscriptions
      return vout
    })

    return {
      tx,
      rawTx: hex && tx.hex ? bitcoin.Transaction.fromHex(tx.hex) : undefined
    }
  }

  static async fetchInscriptions({ outpoint, network = "testnet", decodeMetadata = false }: GetInscriptionsOptions) {
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
      inscriptions = this.transformInscriptions(inscriptions)
    }

    return inscriptions
  }

  static async fetchInscription({ id, network = "testnet", decodeMetadata = false }: FetchInscriptionOptions) {
    if (!id) {
      throw new Error("Invalid options provided.")
    }

    let inscription = await rpc[network].call<Inscription>(
      "GetInscription",
      {
        id,
        network
      },
      rpc.id
    )

    if (decodeMetadata) {
      inscription = this.transformInscriptions([inscription])[0]
    }

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

  static async getBalance({ address, network = "testnet" }: GetBalanceOptions) {
    if (!address) {
      throw new Error("Invalid request")
    }

    const balance = await rpc[network].call<number>(
      "GetBalance",
      {
        address
      },
      rpc.id
    )

    return balance
  }
}
