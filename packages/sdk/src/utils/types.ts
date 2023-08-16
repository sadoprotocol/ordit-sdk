import { AddressFormats } from "../addresses/formats"

export interface CalculateTxFeeOptions {
  totalInputs: number
  totalOutputs: number
  satsPerByte: number
  type: AddressFormats
  additional?: {
    witnessScripts?: Buffer[]
  }
}

export type CalculateTxVirtualSizeOptions = Omit<CalculateTxFeeOptions, "satsPerByte">

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
