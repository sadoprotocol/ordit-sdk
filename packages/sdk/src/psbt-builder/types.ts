import { Network } from "../config/types"
import { BaseDatasource } from "../modules/BaseDatasource"
import { Output } from "../transactions/types"

export interface PSBTBuilderOptions {
  address: string
  changeAddress?: string
  feeRate: number
  network: Network
  outputs: Output[]
  publicKey: string
  autoAdjustment?: boolean
  instantTradeMode?: boolean
  datasource?: BaseDatasource
}

export type InjectableInput = {
  injectionIndex: number
  txInput: any
  sats: number
  standardInput: InputType
}

export interface InjectableOutput {
  injectionIndex: number
  txOutput: any
  sats: number
  standardOutput: any
}
