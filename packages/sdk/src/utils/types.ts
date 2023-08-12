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

