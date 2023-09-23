import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { Inscription } from ".."
import { FetchSpendablesOptions, FetchTxOptions, FetchUnspentUTXOsOptions } from "../api/types"
import { Transaction, UTXOLimited } from "../transactions/types"
import { DatasourceUtility } from "."

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
  ): Promise<ReturnType<typeof DatasourceUtility.segregateUTXOsBySpendStatus>> {
    throw new Error("define getUnspents in the derived class")
  }
}
