import { Transaction as BTCTransaction } from "bitcoinjs-lib"

import { Inscription } from ".."
import {
  GetBalanceOptions,
  GetInscriptionOptions,
  GetInscriptionsOptions,
  GetInscriptionUTXOOptions,
  GetSpendablesOptions,
  GetTransactionOptions,
  GetUnspentsOptions,
  GetUnspentsResponse,
  RelayOptions
} from "../api/types"
import { Chain,Network } from "../config/types"
import { Transaction, UTXO, UTXOLimited } from "../transactions/types"

interface BaseDatasourceOptions {
  network: Network
  chain?: Chain
}

export default abstract class BaseDatasource {
  protected readonly network: Network

  protected readonly chain: Chain

  constructor({ chain = "bitcoin", network }: BaseDatasourceOptions) {
    this.network = network
    this.chain = chain
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
    decodeMetadata
  }: GetInscriptionsOptions): Promise<Inscription[]>

  abstract getSpendables({ address, value, type, rarity, filter, limit }: GetSpendablesOptions): Promise<UTXOLimited[]>

  abstract getTransaction({
    txId,
    ordinals,
    hex,
    witness,
    decodeMetadata
  }: GetTransactionOptions): Promise<{ tx: Transaction; rawTx?: BTCTransaction }>

  abstract getUnspents({ address, type, rarity, sort, limit, next }: GetUnspentsOptions): Promise<GetUnspentsResponse>

  abstract relay({ hex, maxFeeRate, validate }: RelayOptions): Promise<string>
}
