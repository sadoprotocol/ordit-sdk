import * as bitcoin from "bitcoinjs-lib"

import { MINIMUM_AMOUNT_IN_SATS } from "~/constants"
import { processInput } from "~/transactions"
import { UTXO } from "~/transactions/types"

import { InstantTradeBuilder } from "./InstantTradeBuilder"
import { InstantTradeSellerTxBuilderArgOptions } from "./types"

export class InstantTradeSellerTxBuilder extends InstantTradeBuilder {
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

    const collection = await this.datasource.getInscription({ id: this.inscription.meta.col as string })
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
    await this.generatSellerInputs()
    await this.generateSellerOutputs()

    await this.prepare()
  }
}
