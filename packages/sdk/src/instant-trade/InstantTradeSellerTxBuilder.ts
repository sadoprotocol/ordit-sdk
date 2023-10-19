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

  private generateSellerOutputs() {
    this.outputs = [
      { address: this.receiveAddress || this.address, value: this.price + this.postage - this.royalty.amount }
    ]

    if (this.royalty.amount > MINIMUM_AMOUNT_IN_SATS && this.royalty.receiver) {
      this.outputs.push({
        address: this.royalty.receiver, // creator address
        value: this.royalty.amount // royalty in sats to be paid to original creator
      })
    }
  }

  private async calculateRoyalty() {
    if (!this.inscription || !this.inscription.meta?.col) {
      return
    }

    const collection = await this.datasource.getInscription({ id: this.inscription.meta.col as string })
    const royalty = collection.meta?.royalty
    if (!royalty || !royalty.address || !royalty.pct) {
      return
    }
    const amount = Math.ceil(royalty.pct * this.price)

    this.setRoyalty({
      price: this.price,
      amount,
      receiver: royalty.address as string,
      percentage: royalty.pct
    })
  }

  private validateOwnership() {
    if (this.inscription?.owner !== this.address) {
      throw new Error(`Inscription does not belong to the address: ${this.address}`)
    }
  }

  async build() {
    if (isNaN(this.price) || this.price < MINIMUM_AMOUNT_IN_SATS) {
      throw new Error("Invalid price")
    }

    this.utxo = await this.verifyAndFindInscriptionUTXO()
    this.validateOwnership()

    await this.calculateRoyalty()

    await this.generatSellerInputs()
    this.generateSellerOutputs()

    await this.prepare()
  }
}
