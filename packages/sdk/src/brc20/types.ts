import { BaseDatasource } from ".."
import { Network } from "../config/types"

export type BRC20Options<T> = {
  datasource: BaseDatasource
  feeRate: number
  network: Network
} & T

export type BRC20DeployOptions = BRC20Options<{
  address: string
  pubKey: string
  destinationAddress?: string
  tick: string
  supply: number
  limit: number
  decimals: number
}>

export type BRC20MintOptions = BRC20Options<{
  address: string
  pubKey: string
  destinationAddress?: string
  tick: string
  amount: number
}>

export type BRC20TransferOptions = BRC20Options<{
  address: string
  pubKey: string
  destinationAddress: string
  tick: string
  amount: number
}>

export type BRC20Operations = "deploy" | "mint" | "transfer"

export type BRC20Base<T> = {
  p: "brc-20"
  tick: string
  op: BRC20Operations
} & T

export type BRC20DeployPayloadAttributes = BRC20Base<{
  op: "deploy"
  max: string
  lim?: string
  dec?: string
}>

export type BRC20MintPayloadAttributes = BRC20Base<{
  op: "mint"
  amt: string
}>

export type BRC20TransferPayloadAttributes = BRC20Base<{
  op: "transfer"
  amt: string
}>

export interface BRC20TokenAttributes {
  inscription: string
  tick: string
  slug: string
  max: number // should be string after BigNumber is implemented
  amount: number // should be string after BigNumber is implemented
  limit: number
  decimal: number
  creator: string
  timestamp: number
}

export type ValidateBRC20TransferOptions = Pick<BRC20TransferOptions, "amount" | "datasource" | "tick" | "network">
export type GetBRC20BalancesOptions = Pick<BRC20TransferOptions, "address" | "datasource" | "tick" | "network">
export type HasEnoughBalanceOptions = Pick<
  BRC20TransferOptions,
  "address" | "amount" | "datasource" | "tick" | "network"
>
