import { Inscription } from ".."
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { PSBTBuilder, PSBTBuilderOptions } from "../transactions/PSBTBuilder"

export interface InstantTradeBuilderArgOptions
  extends Pick<PSBTBuilderOptions, "publicKey" | "network" | "address" | "autoAdjustment" | "feeRate" | "datasource"> {
  inscriptionOutpoint?: string
}

export default class InstantTradeBuilder extends PSBTBuilder {
  protected inscriptionOutpoint?: string
  protected price = 0
  protected postage = 0
  protected royalty = 0
  protected inscription?: Inscription

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

  protected async verifyAndFindInscriptionUTXO() {
    if (!this.inscriptionOutpoint) {
      throw new Error("set inscription outpoint to the class")
    }

    this.inscription = await this.datasource.getInscription(this.inscriptionOutpoint)
    if (!this.inscription) {
      throw new Error("Inscription not found")
    }

    const utxo = await this.datasource.getInscriptionUTXO(this.inscription.outpoint)
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
