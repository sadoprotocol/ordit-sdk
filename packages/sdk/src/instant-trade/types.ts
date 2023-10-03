import { PSBTBuilderOptions } from "../transactions/PSBTBuilder"

export interface InstantTradeBuilderArgOptions
  extends Pick<PSBTBuilderOptions, "publicKey" | "network" | "address" | "autoAdjustment" | "feeRate" | "datasource"> {
  inscriptionOutpoint?: string
}

export interface InstantTradeBuyerTxBuilderArgOptions extends InstantTradeBuilderArgOptions {
  sellerPSBT: string
  receiveAddress?: string
}

export interface InstantTradeSellerTxBuilderArgOptions extends InstantTradeBuilderArgOptions {
  receiveAddress?: string
}
