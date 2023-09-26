import * as bitcoin from "bitcoinjs-lib"

import { processInput } from ".."
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { UTXO } from "../transactions/types"
import InstantTradeBuilder, { InstantTradeBuilderArgOptions } from "./InstantTradeBuilder"

interface InstantTradeSellerTxBuilderArgOptions extends InstantTradeBuilderArgOptions {
  receiveAddress?: string
}

export default class InstantTradeSellerTxBuilder extends InstantTradeBuilder {
  private receiveAddress?: string
  private utxo?: UTXO

  constructor({
    address,
    datasource,
    network,
    publicKey,
    inscriptionOutpoint,
    receiveAddress
  }: InstantTradeSellerTxBuilderArgOptions) {
    super({
      address,
      datasource,
      network,
      publicKey,
      inscriptionOutpoint,
      autoAdjustment: false, // Prevents PSBTBuilder from adding additional input and change output
      feeRate: 0 // seller in instant-trade does not pay network fee
    })

    this.receiveAddress = receiveAddress
  }

  private async generatSellerInputs() {
    if (!this.utxo) {
      throw new Error("UTXO not found")
    }

    const input = await processInput({
      utxo: this.utxo,
      pubKey: this.publicKey,
      network: this.network,
      sighashType: bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY,
      datasource: this.datasource
    })

    this.inputs = [input]
  }

  private async generateSellerOutputs() {
    const royalty = await this.calculateRoyalty()
    this.outputs = [{ address: this.receiveAddress || this.address, value: this.price + this.postage }]

    if (royalty && royalty.amount >= MINIMUM_AMOUNT_IN_SATS) {
      this.outputs.push({
        address: royalty.address, // creator address
        value: royalty.amount // royalty in sats to be paid to original creator
      })
    }
  }

  private async calculateRoyalty() {
    if (!this.inscription || !this.inscription.meta?.col) {
      return
    }

    let collectionId = this.inscription.meta.col as string
    collectionId = collectionId.includes(":")
      ? collectionId.replace(":", "i")
      : !collectionId.includes("i")
      ? `${collectionId}i0`
      : collectionId

    const collection = await this.datasource.getInscription(collectionId)
    const royalty = collection.meta?.royalty
    if (!royalty || !royalty.address || !royalty.pct) {
      return
    }
    const amount = Math.ceil(royalty.pct * this.price)

    return {
      address: royalty.address as string,
      amount: amount >= MINIMUM_AMOUNT_IN_SATS ? amount : 0
    }
  }

  async build() {
    if (isNaN(this.price) || this.price < MINIMUM_AMOUNT_IN_SATS) {
      throw new Error("Invalid price")
    }

    this.utxo = await this.verifyAndFindInscriptionUTXO()
    await this.generatSellerInputs()
    await this.generateSellerOutputs()

    await this.prepare()
  }
}
