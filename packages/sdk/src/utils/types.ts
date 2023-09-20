import { payments } from "bitcoinjs-lib"

import { AddressFormats, AddressTypes } from ".."

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

export interface IsBitcoinPaymentResponse {
  type: AddressTypes
  payload: false | payments.Payment
}

export interface GetScriptTypeResponse extends IsBitcoinPaymentResponse {
  format: AddressFormats
}
