import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { Inscription } from ".."
import { rpc } from "../api/jsonrpc"
import { FetchSpendablesOptions, FetchTxOptions, FetchUnspentUTXOsOptions, RelayTxOptions } from "../api/types"
import { Network } from "../config/types"
import { Transaction, UTXO, UTXOLimited } from "../transactions/types"
import { BaseDatasource, DatasourceUtility } from "."

interface JsonRpcDatasourceOptions {
  network: Network
}

export default class JsonRpcDatasource extends BaseDatasource {
  constructor({ network }: JsonRpcDatasourceOptions) {
    super({ network })
  }

  async getBalance(address: string) {
    if (!address) {
      throw new Error("Invalid request")
    }

    return rpc[this.network].call<number>("GetBalance", { address }, rpc.id)
  }

  async getInscription(id: string, decodeMetadata = false) {
    if (!id) {
      throw new Error("Invalid request")
    }

    let inscription = await rpc[this.network].call<Inscription>("GetInscription", { id }, rpc.id)
    if (decodeMetadata) {
      inscription = DatasourceUtility.transformInscriptions([inscription])[0]
    }

    return inscription
  }

  async getInscriptions(outpoint: string, decodeMetadata = false) {
    if (!outpoint) {
      throw new Error("Invalid options provided.")
    }

    const inscriptions = await rpc[this.network].call<Inscription[]>("GetInscriptions", { outpoint }, rpc.id)
    return decodeMetadata ? DatasourceUtility.transformInscriptions(inscriptions) : inscriptions
  }

  async getSpendables({
    address, // TODO rename interface
    value,
    rarity = ["common"],
    filter = [],
    limit = 200,
    type = "spendable"
  }: FetchSpendablesOptions) {
    if (!address || isNaN(value) || !value) {
      throw new Error("Invalid request")
    }

    return rpc[this.network].call<UTXOLimited[]>(
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

  async getTx({
    txId, // TODO rename interface
    ordinals = true,
    hex = false,
    witness = true,
    decodeMetadata = true
  }: FetchTxOptions) {
    if (!txId) {
      throw new Error("Invalid txId")
    }

    const tx = await rpc[this.network].call<Transaction>(
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
      vout.inscriptions = decodeMetadata
        ? DatasourceUtility.transformInscriptions(vout.inscriptions)
        : vout.inscriptions
      return vout
    })

    return {
      tx,
      rawTx: hex && tx.hex ? BTCTransaction.fromHex(tx.hex) : undefined
    }
  }

  async getUnspents({
    address, // TODO rename interface
    type = "spendable",
    rarity = ["common"],
    decodeMetadata = true,
    sort = "desc",
    limit = 50,
    next = null
  }: FetchUnspentUTXOsOptions) {
    if (!address) {
      throw new Error("Invalid address")
    }

    let utxos: UTXO[] = []
    do {
      const { unspents, pagination } = await rpc[this.network].call<{
        unspents: UTXO[]
        pagination: {
          limit: number
          prev: string | null
          next: string | null
        }
      }>(
        "GetUnspents",
        {
          format: "next",
          address,
          options: {
            allowedrarity: rarity,
            safetospend: type === "spendable"
          },
          pagination: {
            limit,
            next
          },
          sort: { value: sort }
        },
        rpc.id
      )

      utxos = utxos.concat(unspents)
      next = pagination.next
    } while (next != null)

    return DatasourceUtility.segregateUTXOsBySpendStatus({ utxos, decodeMetadata })
  }

  async relay({ hex, maxFeeRate }: RelayTxOptions) {
    if (!hex) {
      throw new Error("Invalid tx hex")
    }

    if (maxFeeRate && (maxFeeRate < 0 || isNaN(maxFeeRate))) {
      throw new Error("Invalid max fee rate")
    }

    return rpc[this.network].call<string>("SendRawTransaction", { hex, maxFeeRate }, rpc.id)
  }
}
