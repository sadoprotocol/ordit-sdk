import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { Inscription } from ".."
import {
  GetBalanceOptions,
  GetInscriptionOptions,
  GetInscriptionsOptions,
  GetInscriptionUTXOOptions,
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

  abstract getBalance({ address }: GetBalanceOptions): Promise<number>

  abstract getInscription({ id, decodeMetadata }: GetInscriptionOptions): Promise<Inscription>

  abstract getInscriptionUTXO({ id }: GetInscriptionUTXOOptions): Promise<UTXO>

  abstract getInscriptions({
    creator,
    owner,
    mimeType,
    mimeSubType,
    outpoint,
    sort,
    limit,
    next,
    include,
    decodeMetadata
  }: GetInscriptionsOptions): Promise<Inscription[]>

  abstract getSpendables({ address, value, type, rarity, filter, limit }: GetSpendablesOptions): Promise<UTXOLimited[]>

  abstract getTransaction({
    txId,
    ordinals,
    hex,
    witness,
    decodeMetadata
  }: GetTxOptions): Promise<{ tx: Transaction; rawTx?: BTCTransaction }>

  abstract getUnspents({ address, type, rarity, sort, limit, next }: GetUnspentsOptions): Promise<GetUnspentsResponse>

  abstract relay({ hex, maxFeeRate, validate }: RelayOptions): Promise<string>
}
