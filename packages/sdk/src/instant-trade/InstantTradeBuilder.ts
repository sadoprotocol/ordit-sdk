import { OrditApi } from ".."
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

  constructor({
    address,
    datasource,
    network,
    publicKey,
    inscriptionOutpoint,
    autoAdjustment
  }: InstantTradeBuilderArgOptions) {
    super({
      address,
      datasource,
      feeRate: 0,
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

  protected async verifyAndFindInscriptionUTXO(address?: string) {
    if (!this.inscriptionOutpoint) {
      throw new Error("set inscription outpoint to the class")
    }

    const { totalUTXOs, unspendableUTXOs } = await OrditApi.fetchUnspentUTXOs({
      address: address || this.address,
      network: this.network,
      type: "all"
    })
    if (!totalUTXOs) {
      throw new Error("No UTXOs found")
    }

    const utxo = unspendableUTXOs.find((utxo) =>
      utxo.inscriptions?.find((i) => i.outpoint === this.inscriptionOutpoint)
    )
    if (!utxo) {
      throw new Error("Inscription not found")
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
