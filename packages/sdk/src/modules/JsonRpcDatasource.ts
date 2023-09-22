import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { Inscription } from ".."
import { rpc } from "../api/jsonrpc"
import { FetchSpendablesOptions, FetchTxOptions, FetchUnspentUTXOsOptions, RelayTxOptions } from "../api/types"
import { Network } from "../config/types"
import { Transaction, UTXO, UTXOLimited } from "../transactions/types"
import AbstractDatasourceBase from "./AbstractDatasourceBase"

interface JsonRpcDatasourceOptions {
  network: Network
}

export default class JsonRpcDatasource extends AbstractDatasourceBase {
  private network: Network

  constructor({ network }: JsonRpcDatasourceOptions) {
    super()

    this.network = network
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
      inscription = this.transformInscriptions([inscription])[0]
    }

    return inscription
  }

  async getInscriptions(outpoint: string, decodeMetadata = false) {
    if (!outpoint) {
      throw new Error("Invalid options provided.")
    }

    const inscriptions = await rpc[this.network].call<Inscription[]>("GetInscriptions", { outpoint }, rpc.id)
    return decodeMetadata ? this.transformInscriptions(inscriptions) : inscriptions
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
      vout.inscriptions = decodeMetadata ? this.transformInscriptions(vout.inscriptions) : vout.inscriptions
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
    sort = "desc" // TODO: accept pagination cursor
  }: FetchUnspentUTXOsOptions) {
    if (!address) {
      throw new Error("Invalid address")
    }

    const utxos = await rpc[this.network].call<UTXO[]>(
      "GetUnspents",
      {
        address,
        options: {
          allowedrarity: rarity,
          safetospend: type === "spendable"
        },
        pagination: {
          limit: 50 // TODO: accept in args
        },
        sort: { value: sort }
      },
      rpc.id
    )

    return this.segregateUTXOsBySpendStatus({ utxos, decodeMetadata })
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
