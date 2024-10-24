import { PSBTBuilderOptions } from "../transactions/PSBTBuilder"
import { Chain } from "../config/types"

export type UTXOManagerOptions = Pick<
  PSBTBuilderOptions,
  "address" | "network" | "publicKey" | "feeRate" | "datasource"
> & {
  chain?: Chain
}
