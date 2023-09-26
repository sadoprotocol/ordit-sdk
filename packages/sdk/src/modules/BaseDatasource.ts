import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { Inscription } from ".."
import {
  GetInscriptionsOptions,
  GetSpendablesOptions,
  GetTxOptions,
  GetUnspentsOptions,
  GetUnspentsResponse,
  RelayOptions
} from "../api/types"
import { Network } from "../config/types"
import { Transaction, UTXO, UTXOLimited } from "../transactions/types"

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

  abstract getInscriptions({
    creator,
    owner,
    mimeType,
    mimeSubType,
    outpoint,
    sort,
    limit,
    next,
    decodeMetadata
  }: GetInscriptionsOptions): Promise<Inscription[]>

  abstract getSpendables(args?: GetSpendablesOptions): Promise<UTXOLimited[]>

  abstract getTransaction(args: GetTxOptions): Promise<{ tx: Transaction; rawTx?: BTCTransaction }>

  abstract getUnspents(args: GetUnspentsOptions): Promise<GetUnspentsResponse>

  abstract relay(args: RelayOptions): Promise<string>
}
