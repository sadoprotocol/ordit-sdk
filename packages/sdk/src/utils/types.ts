import { Psbt } from "bitcoinjs-lib"

import { AddressFormats } from ".."
import { Network } from "../config/types"

export interface CalculateTxFeeOptions {
  psbt: Psbt
  satsPerByte: number
  network: Network
}

export interface CalculateTxVirtualSizeOptions {
  psbt: Psbt
  network: Network
}

export interface PSBTComponents {
  inputs: AddressFormats[]
  outputs: AddressFormats[]
  witnessScripts: Buffer[]
}

export interface NestedObject {
  [key: string]: NestedObject | any
}

export interface EncodeDecodeObjectOptions {
  encode: boolean
  depth?: number
}

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>
  }[Keys]

interface BaseDataFormat {
  hex?: string
  base64?: string
  buffer?: Buffer
}

export type OneOfAllDataFormats = RequireAtLeastOne<BaseDataFormat, "base64" | "buffer" | "hex">
export type BufferOrHex = RequireAtLeastOne<BaseDataFormat, "buffer" | "hex">
