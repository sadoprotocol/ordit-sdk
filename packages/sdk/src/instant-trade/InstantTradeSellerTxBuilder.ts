import * as bitcoin from "bitcoinjs-lib"

import { processInput } from ".."
import { UTXO } from "../transactions/types"
import { InstantTradeBuilder, InstantTradeBuilderArgOptions } from "./InstantTradeBuilder"

interface InstantTradeSellerTxBuilderArgOptions extends InstantTradeBuilderArgOptions {
  receiveAddress: string
}

export class InstantTradeSellerTxBuilder extends InstantTradeBuilder {
  private receiveAddress: string
  private utxo?: UTXO

  constructor({
    address,
    network,
    publicKey,
    inscriptionOutpoint,
    receiveAddress
  }: InstantTradeSellerTxBuilderArgOptions) {
    super({
      address,
      network,
      publicKey,
      inscriptionOutpoint
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
      sighashType: bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY
    })

    this.inputs = [input]
  }

  private generateSellerOutputs() {
    this.outputs = [{ address: this.receiveAddress, value: this.price + this.postage }]
  }

  async build(price: number) {
    this.validatePrice(price)
    this.utxo = await this.verifyAndFindInscriptionUTXO()

    await this.generatSellerInputs()
    this.generateSellerOutputs()

    await this.prepare()
  }
}
