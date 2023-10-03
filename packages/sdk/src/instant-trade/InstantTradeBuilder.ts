import { MINIMUM_AMOUNT_IN_SATS } from "~/constants"
import { Inscription } from "~/inscription"
import { PSBTBuilder } from "~/psbt-builder"

import { InstantTradeBuilderArgOptions } from "./types"

export class InstantTradeBuilder extends PSBTBuilder {
  protected inscriptionOutpoint?: string
  protected inscription?: Inscription
  protected price = 0
  protected postage = 0
  protected royalty = 0

  constructor({
    address,
    datasource,
    feeRate,
    network,
    publicKey,
    inscriptionOutpoint,
    autoAdjustment
  }: InstantTradeBuilderArgOptions) {
    super({
      address,
      datasource,
      feeRate,
      network,
      publicKey,
      outputs: [],
      autoAdjustment,
      instantTradeMode: true
    })

    this.address = address
    this.inscriptionOutpoint = inscriptionOutpoint
  }

  setPrice(value: number) {
    this.validatePrice(value)
    this.price = parseInt(value.toString())
  }

  setRoyalty(value: number) {
    this.royalty = value
  }

  get data() {
    return {
      fee: this.fee,
      virtualSize: this.virtualSize,
      weight: this.weight,
      changeAmount: this.changeAmount,
      inputAmount: this.inputAmount,
      outputAmount: this.outputAmount,
      price: this.price,
      royalty: this.royalty,
      postage: this.postage
    }
  }

  protected async verifyAndFindInscriptionUTXO() {
    if (!this.inscriptionOutpoint) {
      throw new Error("set inscription outpoint to the class")
    }

    const inscriptions = await this.datasource.getInscriptions({ outpoint: this.inscriptionOutpoint })
    this.inscription = inscriptions.find((inscription) => inscription.outpoint === this.inscriptionOutpoint)
    if (!this.inscription) {
      throw new Error("Inscription not found")
    }

    const utxo = await this.datasource.getInscriptionUTXO({ id: this.inscription.genesis })
    if (!utxo) {
      throw new Error(`Unable to find UTXO: ${this.inscription.outpoint}`)
    }

    this.postage = utxo.sats
    return utxo
  }

  protected validatePrice(price: number) {
    if (isNaN(price) || price < MINIMUM_AMOUNT_IN_SATS) {
      throw new Error("Invalid price")
    }
  }
}
