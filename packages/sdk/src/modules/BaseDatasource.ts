import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { Inscription } from ".."
import { FetchSpendablesOptions, FetchTxOptions, FetchUnspentUTXOsOptions } from "../api/types"
import { Network } from "../config/types"
import { Transaction, UTXO, UTXOLimited } from "../transactions/types"
import { DatasourceUtility } from "."

interface BaseDatasourceOptions {
  network: Network
}

export default abstract class BaseDatasource {
  protected readonly network: Network

  constructor({ network }: BaseDatasourceOptions) {
    this.network = network
  }

  abstract getBalance(address: string): Promise<number>

  abstract getInscription(id: string, decodeMetadata?: boolean): Promise<Inscription>

  abstract getInscriptionUTXO(id: string): Promise<UTXO>

  abstract getInscriptions(outpoint: string, decodeMetadata?: boolean): Promise<Inscription[]>

  abstract getSpendables(args: FetchSpendablesOptions): Promise<UTXOLimited[]>

  abstract getTransaction(args: FetchTxOptions): Promise<{ tx: Transaction; rawTx?: BTCTransaction }>

  abstract getUnspents(
    args: FetchUnspentUTXOsOptions
  ): Promise<ReturnType<typeof DatasourceUtility.segregateUTXOsBySpendStatus>>
}
