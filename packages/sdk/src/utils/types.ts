import { AddressFormats } from "../addresses/formats"

export interface CalculateTxFeeOptions {
  totalInputs: number
  totalOutputs: number
  satsPerByte: number
  type: AddressFormats
  additional?: {
    witnessScript?: Buffer
  }
}

export type CalculateTxVirtualSizeOptions = Omit<CalculateTxFeeOptions, "satsPerByte">
