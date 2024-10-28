import { Chain } from "../config/types"
import { PSBTBuilderOptions } from "../transactions/PSBTBuilder"

export type UTXOManagerOptions = Pick<
  PSBTBuilderOptions,
  "address" | "network" | "publicKey" | "feeRate" | "datasource"
> & {
  chain?: Chain
}
