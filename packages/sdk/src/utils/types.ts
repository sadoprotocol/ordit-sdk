import { payments } from "bitcoinjs-lib"

import { AddressFormats, AddressTypes } from "~/addresses"

export interface NestedObject {
  [key: string]: NestedObject | any
}

export interface EncodeDecodeObjectOptions {
  encode: boolean
  depth?: number
}

export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>
}[keyof T]

interface BaseDataFormat {
  hex?: string
  base64?: string
  buffer?: Buffer
}

export type OneOfAllDataFormats = RequireAtLeastOne<BaseDataFormat>
export type BufferOrHex = RequireAtLeastOne<Pick<BaseDataFormat, "buffer" | "hex">>

export interface IsBitcoinPaymentResponse {
  type: AddressTypes
  payload: false | payments.Payment
}

export interface GetScriptTypeResponse extends IsBitcoinPaymentResponse {
  format: AddressFormats
}
