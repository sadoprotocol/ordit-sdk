import { AddressTypes } from "../addresses/formats"
import { Network } from "../config/types"

export type OnOffUnion = "on" | "off"

export type GetWalletOptions = {
  pubKey: string
  network: Network
  format: AddressTypes | "all"
  safeMode?: OnOffUnion
}

export interface DerivationIndex {
  accountIndex: number
  addressIndex: number
}

export type SigningMessageOptions = Partial<DerivationIndex>