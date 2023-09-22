import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { decodeObject, Inscription } from ".."
import { FetchSpendablesOptions, FetchTxOptions, FetchUnspentUTXOsOptions } from "../api/types"
import { Transaction, UTXO, UTXOLimited } from "../transactions/types"

interface SegregateUTXOsBySpendStatusArgOptions {
  utxos: UTXO[]
  decodeMetadata?: boolean
}

export default class AbstractDatasourceBase {
  constructor() {
    if (new.target === AbstractDatasourceBase) {
      throw new TypeError("cannot construct DatasourceBaseAdapter instances directly")
    }
  }

  async getBalance(_address?: string): Promise<number> {
    throw new Error("define getBalance in the derived class")
  }

  async getInscription(_id?: string, _decodeMetadata = false): Promise<Inscription> {
    throw new Error("define getInscription in the derived class")
  }

  async getInscriptions(_outpoint?: string, _decodeMetadata = false): Promise<Inscription[]> {
    throw new Error("define getInscriptions in the derived class")
  }

  async getSpendables(_args?: FetchSpendablesOptions): Promise<UTXOLimited[]> {
    throw new Error("define getSpendables in the derived class")
  }

  async getTx(_args: FetchTxOptions): Promise<{ tx: Transaction; rawTx?: BTCTransaction }> {
    throw new Error("define getTx in the derived class")
  }

  async getUnspents(
    _args: FetchUnspentUTXOsOptions
  ): Promise<ReturnType<AbstractDatasourceBase["segregateUTXOsBySpendStatus"]>> {
    throw new Error("define getUnspents in the derived class")
  }

  protected transformInscriptions(inscriptions?: Inscription[]) {
    if (!inscriptions) return []

    return inscriptions.map((inscription) => {
      inscription.meta = inscription.meta ? decodeObject(inscription.meta) : inscription.meta
      return inscription
    })
  }

  protected segregateUTXOsBySpendStatus({ utxos, decodeMetadata }: SegregateUTXOsBySpendStatusArgOptions) {
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
}
