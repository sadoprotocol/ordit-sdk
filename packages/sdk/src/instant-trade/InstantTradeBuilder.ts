import { Inscription } from ".."
import { Chain } from "../config/types"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { PSBTBuilder, PSBTBuilderOptions } from "../transactions/PSBTBuilder"
import { OrditSDKError } from "../utils/errors"

export interface InstantTradeBuilderArgOptions
  extends Pick<PSBTBuilderOptions, "publicKey" | "network" | "address" | "autoAdjustment" | "feeRate" | "datasource"> {
  inscriptionOutpoint?: string
  chain?: Chain
}

interface RoyaltyAttributes {
  amount: number
  percentage: number
  receiver: string | null
}

export default class InstantTradeBuilder extends PSBTBuilder {
  protected inscriptionOutpoint?: string
  protected inscription?: Inscription
  protected price = 0
  protected postage = 0
  protected royalty: RoyaltyAttributes = {
    amount: 0,
    percentage: 0,
    receiver: null
  }

  constructor({
    address,
    datasource,
    feeRate,
    network,
    publicKey,
    inscriptionOutpoint,
    autoAdjustment,
    chain = "bitcoin"
  }: InstantTradeBuilderArgOptions) {
    super({
      address,
      datasource,
      feeRate,
      network,
      publicKey,
      outputs: [],
      autoAdjustment,
      instantTradeMode: true,
      chain
    })

    this.address = address
    this.inscriptionOutpoint = inscriptionOutpoint
    this.chain = chain
  }

  setPrice(value: number) {
    this.validatePrice(value)
    this.price = parseInt(value.toString()) // intentional re-parsing to number as value can be floating point
  }

  setRoyalty(
    data: Omit<RoyaltyAttributes, "percentage"> & Partial<Pick<RoyaltyAttributes, "percentage">> & { price: number }
  ) {
    if (data.amount < MINIMUM_AMOUNT_IN_SATS) return

    this.royalty = {
      amount: data.amount,
      receiver: data.receiver,
      // percentage to be used only for display purposes
      percentage:
        data.percentage && data.percentage > 0
          ? data.percentage
          : +new Intl.NumberFormat("en", {
              maximumFractionDigits: 8,
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              roundingMode: "trunc"
            }).format(data.amount / data.price)
    }
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
      throw new OrditSDKError("set inscription outpoint to the class")
    }

    const inscriptions = await this.datasource.getInscriptions({ outpoint: this.inscriptionOutpoint })
    this.inscription = inscriptions.find((inscription) => inscription.outpoint === this.inscriptionOutpoint)
    if (!this.inscription) {
      throw new OrditSDKError("Inscription not found")
    }

    const utxo = await this.datasource.getInscriptionUTXO({ id: this.inscription.id })
    if (!utxo) {
      throw new OrditSDKError(`Unable to find UTXO: ${this.inscription.id}`)
    }

    this.postage = utxo.sats
    return utxo
  }

  protected validatePrice(price: number) {
    if (isNaN(price) || price < MINIMUM_AMOUNT_IN_SATS) {
      throw new OrditSDKError("Invalid price")
    }
  }
}
